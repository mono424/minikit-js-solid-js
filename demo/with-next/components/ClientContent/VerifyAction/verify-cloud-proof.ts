"use server";

import { IDKitConfig, ISuccessResult } from "@worldcoin/idkit-core";

import {
  IVerifyResponse,
  verifyCloudProof,
} from "@worldcoin/idkit-core/backend";

export const verifyProof = async (params: {
  app_id: IDKitConfig["app_id"];
  action: string;
  payload: ISuccessResult;
}) => {
  const { app_id, action, payload } = params;
  let verifyResponse: IVerifyResponse | null = null;

  try {
    verifyResponse = await verifyCloudProof(payload, app_id, action);
  } catch (error) {
    console.log("Error in verifyCloudProof", error);
  }

  return verifyResponse;
};
