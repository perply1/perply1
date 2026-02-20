/**
 * Program upgradeability / authority inspection
 */

import {
  Connection,
  PublicKey,
  type Commitment,
} from "@solana/web3.js";
import type { Cluster } from "./explorer";
import { explorerAccountUrl } from "./explorer";
import type { ProgramInfo } from "./receipt";

const UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

export async function inspectProgram(
  connection: Connection,
  programId: string,
  cluster: Cluster,
  commitment: Commitment = "confirmed"
): Promise<ProgramInfo> {
  const pk = new PublicKey(programId);

  try {
    const info = await connection.getAccountInfo(pk, commitment);
    if (!info) {
      return {
        programId,
        upgradeable: false,
        upgradeAuthority: null,
        explorerLink: explorerAccountUrl(programId, cluster),
        verificationStatus: "unknown",
      };
    }

    const owner = info.owner.toBase58();

    if (owner !== UPGRADEABLE_LOADER.toBase58()) {
      return {
        programId,
        upgradeable: false,
        upgradeAuthority: null,
        explorerLink: explorerAccountUrl(programId, cluster),
        verificationStatus: "unknown",
      };
    }

    // BPFLoaderUpgradeable: first 4 bytes = enum (1 = ProgramData), next 32 = upgrade authority
    const data = info.data;
    if (data.length < 36) {
      return {
        programId,
        upgradeable: true,
        upgradeAuthority: null,
        explorerLink: explorerAccountUrl(programId, cluster),
        verificationStatus: "unknown",
      };
    }

    const discriminator = data.readUInt32LE(0);
    const upgradeAuthority =
      discriminator === 1 ? new PublicKey(data.subarray(4, 36)).toBase58() : null;

    return {
      programId,
      upgradeable: true,
      upgradeAuthority,
      explorerLink: explorerAccountUrl(programId, cluster),
      verificationStatus: "unknown",
    };
  } catch {
    return {
      programId,
      upgradeable: false,
      upgradeAuthority: null,
      explorerLink: explorerAccountUrl(programId, cluster),
      verificationStatus: "unknown",
    };
  }
}
