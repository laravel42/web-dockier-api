import type { DeployParams } from "./types";
import { buildDockerUserData } from "./user-data";

/** Generate a Pulumi TypeScript program for AWS */
export function buildAws(p: DeployParams): string {
  if (p.deployStrategy === "vps") return buildAwsEc2(p);
  if (p.deployStrategy === "serverless") return buildAwsAppRunner(p);
  // "managed" or default → ECS Fargate
  return buildAwsEcsFargate(p);
}

function buildAwsEcsFargate(p: DeployParams): string {
  return `import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";

// ─────────────────────────────────────────────────
// AWS ECS Fargate (Docker) + ECR via @pulumi/docker
// App: ${p.appName} | Image: ${p.dockerImage || p.appName}
// Repo: ${p.repo}@${p.branch}
// ─────────────────────────────────────────────────

const config = new pulumi.Config();
const region = config.get("region") || "${p.region}";
const buildContext = config.get("buildContext") || ".";

// ── VPC ──
const defaultVpc = aws.ec2.getVpcOutput({ default: true });
const defaultSubnets = aws.ec2.getSubnetsOutput({
  filters: [{ name: "vpc-id", values: [defaultVpc.id] }],
});

// ── ECR Repository ──
const ecrRepo = new aws.ecr.Repository("${p.appName}", {
  name: "${p.appName}",
  imageTagMutability: "MUTABLE",
  forceDelete: true,
  imageScanningConfiguration: { scanOnPush: false },
});

// ── ECR Auth ──
const authToken = aws.ecr.getAuthorizationTokenOutput({
  registryId: ecrRepo.registryId,
});

// ── Build & Push Docker Image to ECR ──
const image = new docker.Image("${p.appName}-image", {
  imageName: pulumi.interpolate\`\${ecrRepo.repositoryUrl}:latest\`,
  build: {
    context: buildContext,
    dockerfile: buildContext + "/Dockerfile",
    builderVersion: docker.BuilderVersion.BuilderBuildKit,
  },
  registry: {
    server: ecrRepo.repositoryUrl.apply(url => url.split("/")[0]),
    username: authToken.userName,
    password: authToken.password,
  },
});

// ── CloudWatch Log Group ──
const logGroup = new aws.cloudwatch.LogGroup("${p.appName}", {
  name: "/ecs/${p.appName}",
  retentionInDays: 7,
});

// ── ECS Cluster ──
const cluster = new aws.ecs.Cluster("${p.appName}", {
  name: "${p.appName}",
});

// ── IAM Role for ECS Task Execution ──
const execRole = new aws.iam.Role("${p.appName}-exec", {
  name: "${p.appName}-exec",
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Effect: "Allow",
      Principal: { Service: "ecs-tasks.amazonaws.com" },
    }],
  }),
});

new aws.iam.RolePolicyAttachment("${p.appName}-exec-policy", {
  role: execRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

// ── Security Group ──
const sg = new aws.ec2.SecurityGroup("${p.appName}-sg", {
  name: "${p.appName}-sg",
  description: "Allow inbound traffic for ${p.appName}",
  vpcId: defaultVpc.id,
  ingress: [{
    fromPort: ${p.runtime.port},
    toPort: ${p.runtime.port},
    protocol: "tcp",
    cidrBlocks: ["0.0.0.0/0"],
  }],
  egress: [{
    fromPort: 0,
    toPort: 0,
    protocol: "-1",
    cidrBlocks: ["0.0.0.0/0"],
  }],
});

// ── ECS Task Definition (uses the pushed image digest) ──
const taskDef = new aws.ecs.TaskDefinition("${p.appName}", {
  family: "${p.appName}",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  runtimePlatform: {
    cpuArchitecture: "ARM64",
    operatingSystemFamily: "LINUX",
  },
  cpu: "512",
  memory: "1024",
  executionRoleArn: execRole.arn,
  containerDefinitions: pulumi.all([image.repoDigest, logGroup.name]).apply(
    ([repoDigest, lgName]) => JSON.stringify([{
      name: "${p.appName}",
      image: repoDigest,
      essential: true,
      portMappings: [{ containerPort: ${p.runtime.port}, hostPort: ${p.runtime.port}, protocol: "tcp" }],
      environment: [
        { name: "PORT", value: "${p.runtime.port}" },
        { name: "NODE_ENV", value: "production" },
        { name: "HOSTNAME", value: "0.0.0.0" },
      ],
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": lgName,
          "awslogs-region": region,
          "awslogs-stream-prefix": "ecs",
        },
      },
    }])
  ),
});

// ── ECS Service (desired_count=1, image is already pushed) ──
const service = new aws.ecs.Service("${p.appName}", {
  name: "${p.appName}",
  cluster: cluster.id,
  taskDefinition: taskDef.arn,
  desiredCount: 1,
  launchType: "FARGATE",
  networkConfiguration: {
    subnets: defaultSubnets.ids,
    securityGroups: [sg.id],
    assignPublicIp: true,
  },
});

export const ecrRepositoryUrl = ecrRepo.repositoryUrl;
export const imageDigest = image.repoDigest;
export const clusterName = cluster.name;
export const serviceName = service.name;
export const appUrl = pulumi.interpolate\`ecs-fargate://\${cluster.name}.\${region}\`;
`;
}

function buildAwsAppRunner(p: DeployParams): string {
  return `import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";

// ─────────────────────────────────────────────────
// AWS App Runner (Docker via ECR)
// App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
// Repo: ${p.repo}@${p.branch}
// ─────────────────────────────────────────────────

const config = new pulumi.Config();
const region = config.get("region") || "${p.region}";
const buildContext = config.get("buildContext") || ".";

// ── ECR Repository ──
const ecrRepo = new aws.ecr.Repository("${p.appName}", {
  name: "${p.appName}",
  imageTagMutability: "MUTABLE",
  forceDelete: true,
  imageScanningConfiguration: { scanOnPush: false },
});

// ── ECR Auth ──
const authToken = aws.ecr.getAuthorizationTokenOutput({
  registryId: ecrRepo.registryId,
});

// ── Build & Push Docker Image to ECR ──
const image = new docker.Image("${p.appName}-image", {
  imageName: pulumi.interpolate\`\${ecrRepo.repositoryUrl}:latest\`,
  build: {
    context: buildContext,
    dockerfile: buildContext + "/Dockerfile",
    builderVersion: docker.BuilderVersion.BuilderV1,
  },
  registry: {
    server: ecrRepo.repositoryUrl.apply(url => url.split("/")[0]),
    username: authToken.userName,
    password: authToken.password,
  },
});

// ── IAM Role for App Runner ECR access ──
const accessRole = new aws.iam.Role("${p.appName}-apprunner-ecr", {
  name: "${p.appName}-apprunner-ecr",
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Effect: "Allow",
      Principal: { Service: "build.apprunner.amazonaws.com" },
    }],
  }),
});

new aws.iam.RolePolicyAttachment("${p.appName}-apprunner-ecr-policy", {
  role: accessRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess",
});

// ── App Runner Service (from ECR image) ──
const appRunner = new aws.apprunner.Service("${p.appName}", {
  serviceName: "${p.appName}",
  sourceConfiguration: {
    authenticationConfiguration: { accessRoleArn: accessRole.arn },
    autoDeploymentsEnabled: false,
    imageRepository: {
      imageIdentifier: image.repoDigest,
      imageRepositoryType: "ECR",
      imageConfiguration: {
        port: "${p.runtime.port}",
        runtimeEnvironmentVariables: {
          PORT: "${p.runtime.port}",
          NODE_ENV: "production",
          HOSTNAME: "0.0.0.0",
        },
      },
    },
  },
  instanceConfiguration: { cpu: "1024", memory: "2048" },
  healthCheckConfiguration: {
    protocol: "HTTP",
    path: "/",
    interval: 10,
    timeout: 5,
    healthyThreshold: 1,
    unhealthyThreshold: 5,
  },
  tags: { Name: "${p.appName}", Environment: "production", ManagedBy: "pulumi" },
});

export const ecrRepositoryUrl = ecrRepo.repositoryUrl;
export const imageDigest = image.repoDigest;
export const appUrl = appRunner.serviceUrl.apply((url) => \`https://\${url}\`);
export const serviceArn = appRunner.arn;
`;
}

function buildAwsEc2(p: DeployParams): string {
  const userData = buildDockerUserData(p);

  return `import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// ─────────────────────────────────────────────────
// AWS EC2 Single VPS
// App: ${p.appName} | Runtime: ${p.runtime.name} ${p.runtime.version}
// Repo: ${p.repo}@${p.branch}
// ─────────────────────────────────────────────────

const config = new pulumi.Config();
const region = config.get("region") || "${p.region}";
const suffix = config.get("keyPairSuffix") || "";
const name = (base: string) => suffix ? \`${p.appName}-\${suffix}-\${base}\` : \`${p.appName}-\${base}\`;

// ── Default VPC & Subnet (avoids "No default subnet for AZ" when us-east-1a has none) ──
const defaultVpc = aws.ec2.getVpcOutput({ default: true });
const defaultSubnets = aws.ec2.getSubnetsOutput({
  filters: [{ name: "vpc-id", values: [defaultVpc.id] }],
});
const subnetId = defaultSubnets.ids.apply(ids => ids[0]);

// ── Key Pair ──
const keyPair = new aws.ec2.KeyPair("${p.appName}-key", {
  keyName: name("key"),
  publicKey: config.require("sshPublicKey"),
});

// ── Security Group ──
const sg = new aws.ec2.SecurityGroup("${p.appName}-sg", {
  name: name("sg"),
  description: "Allow HTTP/HTTPS/SSH for ${p.appName}",
  vpcId: defaultVpc.id,
  ingress: [
    { fromPort: 22, toPort: 22, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
    { fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
    { fromPort: 443, toPort: 443, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
  ],
  egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }],
});

// ── AMI (Ubuntu 24.04 ARM64) ──
const ami = aws.ec2.getAmiOutput({
  mostRecent: true,
  owners: ["099720109477"],
  filters: [
    { name: "name", values: ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"] },
    { name: "architecture", values: ["arm64"] },
  ],
});

// ── EC2 Instance (use subnet from default VPC; avoids "No default subnet for AZ" errors) ──
const server = new aws.ec2.Instance("${p.appName}", {
  ami: ami.id,
  instanceType: "t4g.small",
  subnetId,
  keyName: keyPair.keyName,
  vpcSecurityGroupIds: [sg.id],
  associatePublicIpAddress: true,
  rootBlockDevice: { volumeSize: 30, volumeType: "gp3" },
  userData: \`${userData.replace(/`/g, "\\`").replace(/\$/g, "\\$")}\`,
  tags: { Name: name("instance"), ManagedBy: "pulumi" },
});

export const serverIp = server.publicIp;
export const appUrl = server.publicIp.apply((ip) => \`http://\${ip}\`);
`;
}
