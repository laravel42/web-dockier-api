import { describe, expect, it, vi } from "vitest";

const mockSend = vi.fn();
vi.mock("../../../../../lib/aws-sdk.js", () => ({
  getCfn: async () => ({
    DescribeStackEventsCommand: class {
      constructor(public input: unknown) {}
    },
  }),
  getEc2: async () => ({}),
  getEcr: async () => ({}),
}));

const { describeStackFailureReason } = await import("../aws-helpers.js");

type Event = {
  LogicalResourceId?: string;
  ResourceType?: string;
  ResourceStatus?: string;
  ResourceStatusReason?: string;
};

function cfnWith(events: Event[]) {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ StackEvents: events });
  return { send: mockSend } as unknown as Parameters<typeof describeStackFailureReason>[0];
}

/**
 * Why a stack failed.
 *
 * A rolled-back stack reports an empty `StackStatusReason`, so the deploy log
 * used to say only "UPDATE_ROLLBACK_COMPLETE — UPDATE_ROLLBACK_COMPLETE", which
 * tells the user nothing. The cause is on the first resource event that failed.
 */
describe("describeStackFailureReason", () => {
  const logs: string[] = [];
  const log = async (line: string) => { logs.push(line); };
  const freshLog = () => { logs.length = 0; return log; };

  it("returns the root-cause resource failure, not the last one", () => {
    // DescribeStackEvents returns newest-first, so the root cause is last.
    const cfn = cfnWith([
      { LogicalResourceId: "Distribution", ResourceStatus: "UPDATE_FAILED", ResourceStatusReason: "Resource update cancelled" },
      { LogicalResourceId: "UriRewriteFunction", ResourceType: "AWS::CloudFront::Function", ResourceStatus: "CREATE_FAILED", ResourceStatusReason: "User: arn:aws:iam::1:user/d is not authorized to perform: cloudfront:CreateFunction" },
    ]);
    return describeStackFailureReason(cfn, "stack", freshLog()).then((reason) => {
      expect(reason).toContain("UriRewriteFunction");
      expect(reason).toContain("cloudfront:CreateFunction");
    });
  });

  it("drops CloudFormation's cancellation noise", async () => {
    const cfn = cfnWith([
      { LogicalResourceId: "A", ResourceStatus: "CREATE_FAILED", ResourceStatusReason: "Resource creation cancelled" },
      { LogicalResourceId: "B", ResourceStatus: "CREATE_FAILED", ResourceStatusReason: "Resource update cancelled" },
      { LogicalResourceId: "Real", ResourceStatus: "CREATE_FAILED", ResourceStatusReason: "Something actually broke" },
    ]);
    const reason = await describeStackFailureReason(cfn, "stack", freshLog());
    expect(reason).toContain("Real");
    expect(reason).toContain("Something actually broke");
    expect(logs.join("\n")).not.toContain("cancelled");
  });

  it("includes the resource type so the failing resource is identifiable", async () => {
    const cfn = cfnWith([
      { LogicalResourceId: "UriRewriteFunction", ResourceType: "AWS::CloudFront::Function", ResourceStatus: "CREATE_FAILED", ResourceStatusReason: "boom" },
    ]);
    const reason = await describeStackFailureReason(cfn, "stack", freshLog());
    expect(reason).toBe("UriRewriteFunction (AWS::CloudFront::Function): boom");
  });

  it("writes each distinct failure to the deploy log", async () => {
    const cfn = cfnWith([
      { LogicalResourceId: "Two", ResourceStatus: "CREATE_FAILED", ResourceStatusReason: "second" },
      { LogicalResourceId: "One", ResourceStatus: "CREATE_FAILED", ResourceStatusReason: "first" },
    ]);
    await describeStackFailureReason(cfn, "stack", freshLog());
    expect(logs).toEqual(["✗ One: first", "✗ Two: second"]);
  });

  it("reports each resource once even when it fails repeatedly", async () => {
    const cfn = cfnWith([
      { LogicalResourceId: "Same", ResourceStatus: "CREATE_FAILED", ResourceStatusReason: "again" },
      { LogicalResourceId: "Same", ResourceStatus: "CREATE_FAILED", ResourceStatusReason: "first time" },
    ]);
    await describeStackFailureReason(cfn, "stack", freshLog());
    expect(logs).toHaveLength(1);
  });

  it("returns empty when nothing failed", async () => {
    const cfn = cfnWith([
      { LogicalResourceId: "Distribution", ResourceStatus: "CREATE_COMPLETE" },
    ]);
    expect(await describeStackFailureReason(cfn, "stack", freshLog())).toBe("");
  });

  it("degrades to a warning when events cannot be read", async () => {
    // e.g. credentials without cloudformation:DescribeStackEvents. Diagnosis must
    // never replace the original deploy failure with a different one.
    mockSend.mockReset();
    mockSend.mockRejectedValue(new Error("AccessDenied: DescribeStackEvents"));
    const cfn = { send: mockSend } as unknown as Parameters<typeof describeStackFailureReason>[0];
    const reason = await describeStackFailureReason(cfn, "stack", freshLog());
    expect(reason).toBe("");
    expect(logs.join("\n")).toMatch(/Could not read CloudFormation stack events/);
  });
});
