import { Construct } from "constructs";
import {
  App,
  TerraformStack,
  CloudBackend,
  NamedCloudWorkspace,
  AssetType,
  TerraformAsset,
  TerraformOutput,
} from "cdktf";
import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { ArchiveProvider } from "@cdktf/provider-archive/lib/provider";
import { S3Bucket } from "@cdktf/provider-aws/lib/s3-bucket";
import { RandomProvider } from "@cdktf/provider-random/lib/provider";
import { Pet } from "@cdktf/provider-random/lib/pet";
import { IamRolePolicyAttachment } from "@cdktf/provider-aws/lib/iam-role-policy-attachment";
import { IamRole } from "@cdktf/provider-aws/lib/iam-role";
import { S3Object } from "@cdktf/provider-aws/lib/s3-object";
import { LambdaFunction } from "@cdktf/provider-aws/lib/lambda-function";
import { DynamodbTable } from "@cdktf/provider-aws/lib/dynamodb-table";
import { IamPolicy } from "@cdktf/provider-aws/lib/iam-policy";
import {
  Apigatewayv2Api,
  Apigatewayv2ApiConfig,
} from "@cdktf/provider-aws/lib/apigatewayv2-api";
import { LambdaPermission } from "@cdktf/provider-aws/lib/lambda-permission";
import { Apigatewayv2Route } from "@cdktf/provider-aws/lib/apigatewayv2-route";
import { Apigatewayv2Integration } from "@cdktf/provider-aws/lib/apigatewayv2-integration";
import { Apigatewayv2Stage } from "@cdktf/provider-aws/lib/apigatewayv2-stage";
import { DataAwsRoute53Zone } from "@cdktf/provider-aws/lib/data-aws-route53-zone";
import { Apigatewayv2DomainName } from "@cdktf/provider-aws/lib/apigatewayv2-domain-name";
import { AcmCertificate } from "@cdktf/provider-aws/lib/acm-certificate";
import { AcmCertificateValidation } from "@cdktf/provider-aws/lib/acm-certificate-validation";
import { Route53Record } from "@cdktf/provider-aws/lib/route53-record";
import { Apigatewayv2ApiMapping } from "@cdktf/provider-aws/lib/apigatewayv2-api-mapping";

interface LambdaFunctionConfig {
  runtime: string;
  stageName: string;
  version: string;
}

const assumeRolePolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Action: "sts:AssumeRole",
      Principal: {
        Service: "lambda.amazonaws.com",
      },
      Effect: "Allow",
      Sid: "",
    },
  ],
});

class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string, config: LambdaFunctionConfig) {
    super(scope, id);

    // archive provider
    new ArchiveProvider(this, "archive-provider");

    // random
    new RandomProvider(this, "random");
    const pet = new Pet(this, "random-name", { length: 2 });

    // aws resources
    new AwsProvider(this, "provider", { region: "us-west-2" });

    // rotue53
    const zone = new DataAwsRoute53Zone(this, "doingcloustuffZone", {
      name: "doingcloudstuff.com",
    });

    // dynamodb
    const scoobyTable = new DynamodbTable(this, "scooby-table", {
      name: "ScoobyTable",
      hashKey: "name",
      rangeKey: "datetime",
      billingMode: "PAY_PER_REQUEST",
      attribute: [
        { name: "name", type: "S" },
        { name: "datetime", type: "S" },
      ],
    });

    // s3 bucket
    const bucket = new S3Bucket(this, "bucket", {
      bucket: "scooby-app-bucket",
    });

    // Create Lambda executable
    const asset = new TerraformAsset(this, "lambda-asset", {
      path: "./src/",
      type: AssetType.ARCHIVE, // if left empty it infers directory and file
    });

    // Upload Lambda zip file to newly created S3 bucket
    const lambdaArchive = new S3Object(this, "lambda-archive", {
      bucket: bucket.bucket,
      key: `${config.version}/${asset.fileName}`,
      source: asset.path, // returns a posix path
    });

    // Create Lambda role
    const role = new IamRole(this, "lambda-exec", {
      name: `learn-cdktf-${id}-${pet.id}`,
      assumeRolePolicy,
    });

    // Add execution role for lambda to write to CloudWatch logs
    const lambdaPolicy = new IamPolicy(this, "lambda-permission", {
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
            ],
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: ["dynamodb:*"],
            Resource: scoobyTable.arn,
          },
        ],
      }),
    });
    new IamRolePolicyAttachment(this, "lambda-managed-policy", {
      policyArn: lambdaPolicy.arn,
      role: role.name,
    });

    // Create Lambda function
    const weightGet = new LambdaFunction(this, "weightGet", {
      functionName: `${id}-${pet.id}-get`,
      s3Bucket: bucket.bucket,
      s3Key: lambdaArchive.key,
      handler: "get.handler",
      runtime: config.runtime,
      sourceCodeHash: asset.assetHash,
      role: role.arn,
    });

    const weightPost = new LambdaFunction(this, "weightPost", {
      functionName: `${id}-${pet.id}-post`,
      s3Bucket: bucket.bucket,
      s3Key: lambdaArchive.key,
      handler: "post.handler",
      runtime: config.runtime,
      sourceCodeHash: asset.assetHash,
      role: role.arn,
    });

    // Create and configure API gateway
    const apiConfig: Apigatewayv2ApiConfig = {
      name: "scooby-api",
      protocolType: "HTTP",
    };
    const api = new Apigatewayv2Api(this, "api-gw", apiConfig);

    const apiStage = new Apigatewayv2Stage(this, "stage", {
      apiId: api.id,
      name: "prod",
      autoDeploy: true,
    });

    // GET /{name}
    new LambdaPermission(this, "apigw-lambda-get", {
      functionName: weightGet.functionName,
      action: "lambda:InvokeFunction",
      principal: "apigateway.amazonaws.com",
      sourceArn: `${api.executionArn}/*/*`,
    });
    const integrationGet = new Apigatewayv2Integration(this, "integrationGet", {
      apiId: api.id,
      integrationType: "AWS_PROXY",
      integrationUri: weightGet.invokeArn,
      integrationMethod: "POST",
    });
    new Apigatewayv2Route(this, "routeGet", {
      apiId: api.id,
      routeKey: "GET /{name}",
      target: `integrations/${integrationGet.id}`,
    });

    // POST /{name}
    new LambdaPermission(this, "apigw-lambda-post", {
      functionName: weightPost.functionName,
      action: "lambda:InvokeFunction",
      principal: "apigateway.amazonaws.com",
      sourceArn: `${api.executionArn}/*/*`,
    });
    const integrationPost = new Apigatewayv2Integration(
      this,
      "integrationPost",
      {
        apiId: api.id,
        integrationType: "AWS_PROXY",
        integrationUri: weightPost.invokeArn,
        integrationMethod: "POST",
      }
    );
    new Apigatewayv2Route(this, "routePost", {
      apiId: api.id,
      routeKey: "POST /{name}",
      target: `integrations/${integrationPost.id}`,
    });

    // custom domain
    const cert = new AcmCertificate(this, "cert", {
      domainName: "weights-api.doingcloudstuff.com",
      validationMethod: "DNS",
    });

    new AcmCertificateValidation(this, "cert-validation", {
      certificateArn: cert.arn,
    });

    const apiDomain = new Apigatewayv2DomainName(this, "apiCustomDomain", {
      domainName: "weights-api.doingcloudstuff.com",
      domainNameConfiguration: {
        certificateArn: cert.arn,
        endpointType: "REGIONAL",
        securityPolicy: "TLS_1_2",
      },
    });

    new Apigatewayv2ApiMapping(this, "apiMapping", {
      apiId: api.id,
      stage: apiStage.name,
      domainName: apiDomain.domainName,
    });

    new Route53Record(this, "apiRecord", {
      name: "weights-api.doingcloudstuff.com",
      type: "A",
      zoneId: zone.id,
      alias: {
        name: apiDomain.domainNameConfiguration.targetDomainName,
        zoneId: apiDomain.domainNameConfiguration.hostedZoneId,
        evaluateTargetHealth: false,
      },
    });

    // Output
    new TerraformOutput(this, "url", {
      value: api.apiEndpoint,
    });

    new TerraformOutput(this, "apiDomainOutput", {
      value: apiDomain,
    });
  }
}

const app = new App();

const stack = new MyStack(app, "scooby", {
  runtime: "python3.10",
  stageName: "prod",
  version: "v0.1.0",
});

new CloudBackend(stack, {
  hostname: "app.terraform.io",
  organization: "doingcloudstuff",
  workspaces: new NamedCloudWorkspace("scooby"),
});

app.synth();
