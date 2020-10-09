import { keccak256 } from "js-sha3";
import { OpenAttestationDocument as v2OpenAttestationDocument } from "../../__generated__/schema.2.0";
import { OpenAttestationCredential } from "../../__generated__/schema.3.0";
import { WrappedDocument, SchemaId, OpenAttestationVerifiableCredential, SignedWrappedDocument } from "../../shared/@types/document";
import { unsaltData } from "../../2.0/salt";
import Ajv from "ajv";

export type Hash = string | Buffer;
type Extract<P> = P extends WrappedDocument<infer T> ? T : never;
export const getData = <T extends { data: any }>(document: T): Extract<T> => {
  return unsaltData(document.data);
};

/**
 * Sorts the given Buffers lexicographically and then concatenates them to form one continuous Buffer
 */
export function bufSortJoin(...args: Buffer[]): Buffer {
  return Buffer.concat([...args].sort(Buffer.compare));
}

// If hash is not a buffer, convert it to buffer (without hashing it)
export function hashToBuffer(hash: Hash): Buffer {
  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore https://github.com/Microsoft/TypeScript/issues/23155
  return Buffer.isBuffer(hash) && hash.length === 32 ? hash : Buffer.from(hash, "hex");
}

// If element is not a buffer, stringify it and then hash it to be a buffer
export function toBuffer(element: any): Buffer {
  return Buffer.isBuffer(element) && element.length === 32 ? element : hashToBuffer(keccak256(JSON.stringify(element)));
}
/**
 * Turns array of data into sorted array of hashes
 */
export function hashArray(arr: any[]) {
  return arr.map(i => toBuffer(i)).sort(Buffer.compare);
}

/**
 * Returns the keccak hash of two buffers after concatenating them and sorting them
 * If either hash is not given, the input is returned
 */
export function combineHashBuffers(first?: Buffer, second?: Buffer): Buffer {
  if (!second) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return first!; // it should always be valued if second is not
  }
  if (!first) {
    return second;
  }
  return hashToBuffer(keccak256(bufSortJoin(first, second)));
}

/**
 * Returns the keccak hash of two string after concatenating them and sorting them
 * If either hash is not given, the input is returned
 * @param first A string to be hashed (without 0x)
 * @param second A string to be hashed (without 0x)
 * @returns Resulting string after the hash is combined (without 0x)
 */
export function combineHashString(first?: string, second?: string): string {
  return first && second
    ? combineHashBuffers(hashToBuffer(first), hashToBuffer(second)).toString("hex")
    : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (first || second)!; // this should always return a value right ? :)
}

export const isWrappedV3Document = (
  document: any
): document is OpenAttestationVerifiableCredential<OpenAttestationCredential> => {
  return document && document.version === SchemaId.v3;
};
export const isWrappedV2Document = (document: any): document is WrappedDocument<v2OpenAttestationDocument> => {
  return !isWrappedV3Document(document);
};
export const isSignedWrappedV2Document = (
  document: any
): document is SignedWrappedDocument<v2OpenAttestationDocument> => {
  return document.proof && isWrappedV2Document(document);
};

export function getIssuerAddress(param: WrappedDocument<v2OpenAttestationDocument>): string[];
export function getIssuerAddress(param: OpenAttestationVerifiableCredential<OpenAttestationCredential>): string;
export function getIssuerAddress(document: any): any {
  if (isWrappedV2Document(document)) {
    const data = getData(document);
    return data.issuers.map(issuer => issuer.certificateStore || issuer.documentStore || issuer.tokenRegistry);
  } else if (isWrappedV3Document(document)) {
    return document.oaProof.value;
  }
  throw new Error("");
}

export class SchemaValidationError extends Error {
  constructor(message: string, public validationErrors: Ajv.ErrorObject[], public document: any) {
    super(message);
  }
}
export const isSchemaValidationError = (error: any): error is SchemaValidationError => {
  return !!error.validationErrors;
};

// make it available for consumers
export { keccak256 } from "js-sha3";
