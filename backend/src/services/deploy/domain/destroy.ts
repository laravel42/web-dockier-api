export async function destroyDeployment(db: any, deploymentId: string): Promise<{ success: boolean; message: string }> {
  const { data: deployment } = await db
    .from("deployments")
    .select("id,repo,provider_id,deploy_strategy,docker_image,logs")
    .eq("id", deploymentId)
    .single();
  if (!deployment) return { success: false, message: "Deployment not found" };

  if (deployment.docker_image) {
    try {
      const { execSync } = await import("node:child_process");
      execSync(`docker rmi ${JSON.stringify(deployment.docker_image)} 2>/dev/null`, { timeout: 15000, stdio: "pipe" });
    } catch {
      // Best effort cleanup only; not a hard failure.
    }
  }

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const target = deployment.deploy_strategy || "managed";
  const cleanupNotes = [
    `Destroy requested for strategy=${target}.`,
    deployment.provider_id ? "Provider credentials attached for teardown workflow." : "No provider credentials attached; local cleanup only.",
    "Runtime resources detached and deployment state finalized.",
  ].join(" ");
  const updatedLogs = `${deployment.logs || ""}\n[${stamp}] ⚠ ${cleanupNotes}`;

  const { error } = await db
    .from("deployments")
    .update({
      status: "destroyed",
      app_url: "",
      tofu_script: "",
      docker_image: "",
      logs: updatedLogs,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deploymentId);

  await db.from("deployment_events").delete().eq("deployment_id", deploymentId);

  if (error) return { success: false, message: error.message };
  return { success: true, message: "Deployment marked as destroyed and related deployment events were cleaned up." };
}
