import { SiweMessage } from "types/wallet-auth";
import { ethers } from "ethers";
import { MiniAppWalletAuthSuccessPayload } from "types/responses";
import { randomBytes } from "crypto";

const PREAMBLE = " wants you to sign in with your Ethereum account:";
const URI_TAG = "URI: ";
const VERSION_TAG = "Version: ";
const CHAIN_TAG = "Chain ID: ";
const NONCE_TAG = "Nonce: ";
const IAT_TAG = "Issued At: ";
const EXP_TAG = "Expiration Time: ";
const NBF_TAG = "Not Before: ";
const RID_TAG = "Request ID: ";
const ERC_191_PREFIX = "\x19Ethereum Signed Message:\n";

const tagged = (line, tag) => {
  if (line && line.includes(tag)) {
    return line.replace(tag, ""); // This removes the exact tag content from the line
  } else {
    throw new Error(`Missing '${tag}'`);
  }
};

// TODO: Refactor this into a class
export const parseSiweMessage = (inputString: string) => {
  const lines = inputString.split("\n")[Symbol.iterator]();
  const domain = tagged(lines.next()?.value, PREAMBLE);
  const address = lines.next()?.value;
  lines.next();

  const nextValue = lines.next()?.value;
  let statement;
  if (nextValue) {
    statement = nextValue;
    lines.next();
  }

  const uri = tagged(lines.next()?.value, URI_TAG);
  const version = tagged(lines.next()?.value, VERSION_TAG);
  const chain_id = tagged(lines.next()?.value, CHAIN_TAG);
  const nonce = tagged(lines.next()?.value, NONCE_TAG);
  const issued_at = tagged(lines.next()?.value, IAT_TAG);

  // These ones are optional. Check if the line exists and matches the expected tag before parsing.
  let expiration_time, not_before, request_id;
  for (let line of lines) {
    if (line.startsWith(EXP_TAG)) {
      expiration_time = tagged(line, EXP_TAG);
    } else if (line.startsWith(NBF_TAG)) {
      not_before = tagged(line, NBF_TAG);
    } else if (line.startsWith(RID_TAG)) {
      request_id = tagged(line, RID_TAG);
    }
  }

  if (lines.next().done === false) {
    throw new Error("Extra lines in the input");
  }

  const siweMessageData: SiweMessage = {
    domain,
    address,
    statement,
    uri,
    version,
    chain_id,
    nonce,
    issued_at,
    expiration_time,
    not_before,
    request_id,
  };

  return siweMessageData;
};

export const generateSiweMessage = (siweMessageData: SiweMessage) => {
  let siweMessage = "";

  if (siweMessageData.scheme) {
    siweMessage += `${siweMessageData.scheme}://${siweMessageData.domain} wants you to sign in with your Ethereum account:\n`;
  } else {
    siweMessage += `${siweMessageData.domain} wants you to sign in with your Ethereum account:\n`;
  }

  // NOTE: This is differs from the ERC-4361 spec where the address is required
  if (siweMessageData.address) {
    siweMessage += `${siweMessageData.address}\n`;
  } else {
    siweMessage += "{address}\n";
  }
  siweMessage += "\n";

  if (siweMessageData.statement) {
    siweMessage += `${siweMessageData.statement}\n`;
  }

  siweMessage += "\n";

  siweMessage += `URI: ${siweMessageData.uri}\n`;
  siweMessage += `Version: ${siweMessageData.version}\n`;
  siweMessage += `Chain ID: ${siweMessageData.chain_id}\n`;
  siweMessage += `Nonce: ${siweMessageData.nonce}\n`;
  siweMessage += `Issued At: ${siweMessageData.issued_at}\n`;

  if (siweMessageData.expiration_time) {
    siweMessage += `Expiration Time: ${siweMessageData.expiration_time}\n`;
  }

  if (siweMessageData.not_before) {
    siweMessage += `Not Before: ${siweMessageData.not_before}\n`;
  }

  if (siweMessageData.request_id) {
    siweMessage += `Request ID: ${siweMessageData.request_id}\n`;
  }

  return siweMessage;
};

export const SAFE_CONTRACT_ABI = [
  {
    name: "checkSignatures",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "dataHash", type: "bytes32" },
      { name: "data", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
];

// Nonce is required to be passed in as a parameter to verify the message
export const verifySiweMessage = async (
  payload: MiniAppWalletAuthSuccessPayload,
  nonce: string,
  statement?: string,
  requestId?: string,
  userProvider?: ethers.Provider
) => {
  if (typeof window !== "undefined") {
    throw new Error("Verify can only be called in the backend");
  }

  const { message, signature, address } = payload;
  const siweMessageData = parseSiweMessage(message);

  // Check expiration_time has not passed
  if (siweMessageData.expiration_time) {
    const expirationTime = new Date(siweMessageData.expiration_time);
    if (expirationTime < new Date()) {
      throw new Error("Expired message");
    }
  }

  if (siweMessageData.not_before) {
    const notBefore = new Date(siweMessageData.not_before);
    if (notBefore > new Date()) {
      throw new Error("Not Before time has not passed");
    }
  }

  if (nonce && siweMessageData.nonce !== nonce) {
    throw new Error("Nonce mismatch");
  }

  if (statement && siweMessageData.statement !== statement) {
    throw new Error("Statement mismatch");
  }

  if (requestId && siweMessageData.request_id !== requestId) {
    throw new Error("Request ID mismatch");
  }

  // Check ERC-191 Signature Matches
  let provider =
    userProvider || ethers.getDefaultProvider("https://mainnet.optimism.io");
  const signedMessage = `${ERC_191_PREFIX}${message.length}${message}`;
  const messageBytes = Buffer.from(signedMessage, "utf8").toString("hex");
  const hashedMessage = ethers.hashMessage(signedMessage);
  const contract = new ethers.Contract(address, SAFE_CONTRACT_ABI, provider);

  try {
    await contract.checkSignatures(
      hashedMessage,
      `0x${messageBytes}`,
      signature
    );
  } catch (error) {
    throw new Error("Signature verification failed");
  }
  return { isValid: true, siweMessageData: siweMessageData };
};

export const generateNonce = (): string => {
  const nonce = randomBytes(12).toString("hex"); // Generates a 24-character hex string
  if (!nonce || nonce.length < 8) {
    throw new Error("Error during nonce creation.");
  }
  return nonce;
};