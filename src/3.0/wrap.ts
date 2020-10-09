import { hashToBuffer, SchemaValidationError } from "../shared/utils";
import { MerkleTree } from "../shared/merkle";
import { OpenAttestationVerifiableCredential, SchemaId, SignatureAlgorithm } from "../shared/@types/document";
import { digestCredential } from "../3.0/digest";
import { getSchema, validateSchema as validate, validateW3C } from "../shared/validate";
import { WrapDocumentOptionV3 } from "../shared/@types/wrap";
import { OpenAttestationCredential } from "../__generated__/schema.3.0";
import { encodeSalt, salt } from "./salt";

const getExternalSchema = (schema?: string) => (schema ? { schema } : {});

export const wrapCredential = async <T extends OpenAttestationCredential>(
  credential: T,
  options: WrapDocumentOptionV3
): Promise<OpenAttestationVerifiableCredential<T>> => {
  const document = {
    version: SchemaId.v3 as SchemaId.v3,
    ...getExternalSchema(options.externalSchemaId),
    ...credential
  };
  // To ensure that base @context exists, but this also means some of our validateW3C errors may be unreachable
  if (!document["@context"]) {
    document["@context"] = ["https://www.w3.org/2018/credentials/v1"];
  }

  // Since our wrapper adds in OA-specific properties, we should push our OA context. This is also to pass W3C VC test suite.
  if (
    Array.isArray(document["@context"]) &&
    !document["@context"].includes("https://nebulis.github.io/tmp-jsonld/OpenAttestation.v3.jsonld")
  ) {
    document["@context"].push("https://nebulis.github.io/tmp-jsonld/OpenAttestation.v3.jsonld");
  }

  const salts = salt(document);
  const digest = digestCredential(document, salts, []);

  const batchBuffers = [digest].map(hashToBuffer);

  const merkleTree = new MerkleTree(batchBuffers);
  const merkleRoot = merkleTree.getRoot().toString("hex");
  const merkleProof = merkleTree.getProof(hashToBuffer(digest)).map((buffer: Buffer) => buffer.toString("hex"));

  const verifiableCredential: OpenAttestationVerifiableCredential<T> = {
    ...document,
    proof: {
      type: SignatureAlgorithm.OpenAttestationMerkleProofSignature2018,
      targetHash: digest,
      proofs: merkleProof,
      merkleRoot,
      salts: encodeSalt(salts),
      privacy: {
        obfuscated: []
      }
    }
  };
  const errors = validate(verifiableCredential, getSchema(SchemaId.v3));
  if (errors.length > 0) {
    throw new SchemaValidationError("Invalid document", errors, verifiableCredential);
  }
  await validateW3C(verifiableCredential);
  return verifiableCredential;
};

export const wrapCredentials = async <T extends OpenAttestationCredential>(
  documents: T[],
  options: WrapDocumentOptionV3
): Promise<OpenAttestationVerifiableCredential<T>[]> => {
  // create individual verifiable credential
  const verifiableCredentials = await Promise.all(documents.map(document => wrapCredential(document, options)));

  // get all the target hashes to compute the merkle tree and the merkle root
  const merkleTree = new MerkleTree(
    verifiableCredentials.map(verifiableCredential => verifiableCredential.proof.targetHash).map(hashToBuffer)
  );
  const merkleRoot = merkleTree.getRoot().toString("hex");

  // for each document, update the merkle root and add the proofs needed
  return verifiableCredentials.map(verifiableCredential => {
    const digest = verifiableCredential.proof.targetHash;
    const merkleProof = merkleTree.getProof(hashToBuffer(digest)).map((buffer: Buffer) => buffer.toString("hex"));

    return {
      ...verifiableCredential,
      proof: {
        ...verifiableCredential.proof,
        proofs: merkleProof,
        merkleRoot
      }
    };
  });
};
