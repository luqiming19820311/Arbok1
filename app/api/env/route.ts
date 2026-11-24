import { connection } from "next/server";
import {
  inspectEnvironment,
  inspectLocalAiClis,
  listLocalAsrModels,
} from "@/lib/server/env";

export async function GET() {
  await connection();
  return Response.json({
    envDeps: inspectEnvironment(),
    localModels: listLocalAsrModels(),
    localAiClis: inspectLocalAiClis(),
  });
}
