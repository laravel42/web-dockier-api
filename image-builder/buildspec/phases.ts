// Re-export from shared lib — the canonical implementation now lives in lib/buildspec-generator/
export {
  nodeBuildPhase,
  phpBuildPhase,
  pythonBuildPhase,
  goBuildPhase,
  fallbackBuildPhase,
} from "../../lib/buildspec-generator/phases";
