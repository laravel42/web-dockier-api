// Re-export from shared lib — the canonical implementation now lives in lib/buildspec-generator/
export {
  commonPreBuild,
  buildAndPush,
  commonPostBuild,
  staticBuildAndSync,
  staticPostBuild,
} from "../../lib/buildspec-generator/common";
