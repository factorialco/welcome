import { type SetupConfig } from "../../context/index.js";
import { getMachineIdCommand } from "../../platform.js";
import {
  LOCAL_AWS_DEFAULT_REGION,
  LOCAL_AWS_PROFILE,
  LOCAL_DOMAIN,
  PERSONAL_ENV_RC_PATH,
  REPO_PATH,
} from "../constants.js";
import {
  addOrUpdateEnvVar,
  fileExists,
  getErrorMessage,
  sh,
  type ProgressCallback,
  type TaskResult,
} from "../helpers.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Step 11: Setup Cognito authentication */
export async function runStep11(
  config: SetupConfig,
  onProgress: ProgressCallback,
): Promise<TaskResult> {
  const start = Date.now();
  try {
    if (!config.setupCognito) {
      return { success: true, duration: Date.now() - start };
    }

    // Get workspace ID (platform-specific)
    const wsResult = await sh(getMachineIdCommand());
    const workspaceId = wsResult.stdout.trim();
    const cognitoConfigPath = path.join(
      REPO_PATH,
      ".local-dev",
      "scripts",
      "aws",
      "cognito",
      "config",
    );

    // 1. KMS
    onProgress(0, "Provisioning KMS key...");
    const kmsCheck = await sh(
      `aws resourcegroupstaggingapi get-resources --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" --resource-type-filters kms --tag-filters Key=WorkspaceId,Values="${workspaceId}" --query 'ResourceTagMappingList[0].ResourceARN' --output text`,
    );
    let kmsKeyArn: string;
    if (kmsCheck.stdout && kmsCheck.stdout !== "None") {
      const kmsDescribe = await sh(
        `aws kms describe-key --key-id "${kmsCheck.stdout}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
      );
      kmsKeyArn = JSON.parse(kmsDescribe.stdout).KeyMetadata.Arn;
    } else {
      const kmsCreate = await sh(
        `aws kms create-key --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" --description "KMS key for Cognito Lambda trigger" --tags TagKey=Environment,TagValue=development TagKey=WorkspaceId,TagValue="${workspaceId}" TagKey=Owner,TagValue="core identity"`,
      );
      kmsKeyArn = JSON.parse(kmsCreate.stdout).KeyMetadata.Arn;
    }

    // 2. IAM Role
    onProgress(1, "Creating IAM Role...");
    const roleName = `${workspaceId}-role-lambda-trigger`;
    const assumeRoleDoc = await readFile(
      path.join(
        cognitoConfigPath,
        "lambda",
        "assume-role-policy-document.json",
      ),
      "utf-8",
    );
    let roleArn: string;

    const roleCheck = await sh(
      `aws iam get-role --role-name "${roleName}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" 2>/dev/null`,
    );
    if (roleCheck.code === 0) {
      await sh(
        `aws iam update-assume-role-policy --role-name "${roleName}" --policy-document '${assumeRoleDoc}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
      );
      roleArn = JSON.parse(roleCheck.stdout).Role.Arn;
    } else {
      const roleCreate = await sh(
        `aws iam create-role --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" --role-name "${roleName}" --assume-role-policy-document '${assumeRoleDoc}' --tags Key=Environment,Value=development Key=WorkspaceId,Value="${workspaceId}" Key=Owner,Value="core identity"`,
      );
      roleArn = JSON.parse(roleCreate.stdout).Role.Arn;
    }

    await sh(
      `aws iam attach-role-policy --role-name "${roleName}" --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
    );

    // Update policy document with KMS ARN
    const policyDocPath = path.join(
      cognitoConfigPath,
      "lambda",
      "policy-document.json",
    );
    await sh(
      `jq '.Statement[].Resource = $newVal' --arg newVal "${kmsKeyArn}" "${policyDocPath}" > /tmp/policy-tmp-$$.json && mv /tmp/policy-tmp-$$.json "${policyDocPath}"`,
    );
    await sh(
      `aws iam put-role-policy --role-name "${roleName}" --policy-name "${workspaceId}-iam-role-policy-lambda-kms" --policy-document "file://${policyDocPath}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
    );
    await sh(
      `cd "$(dirname "${policyDocPath}")" && git checkout -- "$(basename "${policyDocPath}")"`,
    );

    // 3. Lambda
    onProgress(2, "Deploying Lambda function...");
    const lambdaName = `development-${workspaceId}-cognito-lambda`;

    // Download lambda zip
    const lambdaZipPath = path.join(cognitoConfigPath, "lambda", "lambda.zip");
    await sh(
      `aws s3 cp "s3://workspaces.factorial.co/backend/cognito/lambda.zip" "${lambdaZipPath}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
    );

    // Delete existing lambda if present
    await sh(
      `aws lambda delete-function --function-name "${lambdaName}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" 2>/dev/null || true`,
    );
    await sh("sleep 5"); // Wait for deletion

    // Read tunnel domain
    let tunnelDomain = config.ngrokDomain;
    if (!tunnelDomain) {
      const envContent = (await fileExists(PERSONAL_ENV_RC_PATH))
        ? await readFile(PERSONAL_ENV_RC_PATH, "utf-8")
        : "";
      const match = envContent.match(/TUNNEL_DOMAIN=(.+)/);
      tunnelDomain = match?.[1] ?? "";
    }

    const lambdaConfig = await readFile(
      path.join(cognitoConfigPath, "lambda", "lambda-config.json"),
      "utf-8",
    );
    await sh(
      `aws lambda create-function --function-name "${lambdaName}" --environment 'Variables={KEY_ID=${kmsKeyArn},RAILS_SERVER_URL=${tunnelDomain},RAILS_SERVER_ACCESS_TOKEN=test}' --role "${roleArn}" --tags Environment=development,WorkspaceId="${workspaceId}",Owner='core identity' --zip-file "fileb://${lambdaZipPath}" --cli-input-json '${lambdaConfig}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
    );
    const lambdaInfo = await sh(
      `aws lambda get-function --function-name "${lambdaName}" --query 'Configuration.FunctionArn' --output text --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
    );
    const lambdaArn = lambdaInfo.stdout.trim();

    // Clean up zip
    await sh(`rm -f "${lambdaZipPath}"`);

    // 4. User Pool
    onProgress(3, "Creating Cognito User Pool...");
    const userPoolName = workspaceId;
    // Delete existing pool if needed
    const existingPool = await sh(
      `aws cognito-idp list-user-pools --max-results 60 --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" | jq -r --arg name "${userPoolName}" '.UserPools[] | select(.Name == $name) | .Id' | head -n 1`,
    );
    if (existingPool.stdout) {
      // Delete domain first
      const domainCheck = await sh(
        `aws cognito-idp describe-user-pool --user-pool-id "${existingPool.stdout}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" | jq -r '.UserPool.Domain' 2>/dev/null`,
      );
      if (domainCheck.stdout && domainCheck.stdout !== "null") {
        await sh(
          `aws cognito-idp delete-user-pool-domain --user-pool-id "${existingPool.stdout}" --domain "${domainCheck.stdout}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
        );
      }
      await sh(
        `aws cognito-idp delete-user-pool --user-pool-id "${existingPool.stdout}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
      );
      await sh("sleep 5");
    }

    const userPoolConfig = await readFile(
      path.join(cognitoConfigPath, "user-pool-config.json"),
      "utf-8",
    );
    const poolCreate = await sh(
      `aws cognito-idp create-user-pool --pool-name "${userPoolName}" --lambda-config='UserMigration="${lambdaArn}",CustomEmailSender={LambdaVersion=V1_0,LambdaArn="${lambdaArn}"},KMSKeyID="${kmsKeyArn}"' --user-pool-tags Environment=development,WorkspaceId="${workspaceId}",Owner='core identity' --cli-input-json '${userPoolConfig}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
    );
    const poolData = JSON.parse(poolCreate.stdout);
    const userPoolId = poolData.UserPool.Id;
    const userPoolArn = poolData.UserPool.Arn;

    await sh(
      `aws cognito-idp set-user-pool-mfa-config --user-pool-id "${userPoolId}" --mfa-configuration "OPTIONAL" --software-token-mfa-configuration=Enabled=true --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
    );

    // 5. User Pool Client
    onProgress(4, "Creating User Pool Client...");
    const clientName = `${userPoolName}-client`;
    const userPoolClientConfig = await readFile(
      path.join(cognitoConfigPath, "user-pool-client-config.json"),
      "utf-8",
    );
    const clientCreate = await sh(
      `aws cognito-idp create-user-pool-client --user-pool-id "${userPoolId}" --client-name "${clientName}" --callback-urls "factorial://" "exp://localhost:19000" "https://api.${LOCAL_DOMAIN}/cognito/oauth" --logout-urls "https://app.${LOCAL_DOMAIN}" --default-redirect-uri "https://api.${LOCAL_DOMAIN}/cognito/oauth" --supported-identity-providers "COGNITO" --cli-input-json '${userPoolClientConfig}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
    );
    const clientData = JSON.parse(clientCreate.stdout);
    const userPoolClientId = clientData.UserPoolClient.ClientId;

    // 6. Domain
    onProgress(5, "Configuring domain...");
    await sh(
      `aws cognito-idp create-user-pool-domain --user-pool-id "${userPoolId}" --domain "${workspaceId}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" 2>/dev/null || aws cognito-idp update-user-pool-domain --user-pool-id "${userPoolId}" --domain "${workspaceId}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
    );

    // Add Lambda permission
    const dateToday = Math.floor(Date.now() / 1000);
    await sh(
      `aws lambda add-permission --action lambda:InvokeFunction --function-name "${lambdaName}" --principal cognito-idp.amazonaws.com --source-arn "${userPoolArn}" --statement-id "development-${dateToday}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
    );

    // 7. Secrets Manager
    onProgress(6, "Storing secrets in Secrets Manager...");
    const cognitoSecretsNs = `${LOCAL_AWS_PROFILE}/${workspaceId}/cognito_credentials`;
    const metadataSecretsNs = `${LOCAL_AWS_PROFILE}/${workspaceId}/metadata`;
    const cognitoHost = `${workspaceId}.auth.${LOCAL_AWS_DEFAULT_REGION}.amazoncognito.com`;

    const cognitoSecretJson = JSON.stringify({
      pool_id: userPoolId,
      app_client_id: userPoolClientId,
      cognito_host: cognitoHost,
    });
    const cognitoSecretCheck = await sh(
      `aws secretsmanager describe-secret --secret-id "${cognitoSecretsNs}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" 2>/dev/null`,
    );
    if (cognitoSecretCheck.code === 0) {
      await sh(
        `aws secretsmanager put-secret-value --secret-id "${cognitoSecretsNs}" --secret-string '${cognitoSecretJson}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
      );
    } else {
      await sh(
        `aws secretsmanager create-secret --name "${cognitoSecretsNs}" --description "Cognito credentials" --tags Key=Environment,Value=development Key=WorkspaceId,Value="${workspaceId}" Key=Owner,Value="core identity" --secret-string '${cognitoSecretJson}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
      );
    }

    const metadataJson = JSON.stringify({ kms_key_arn: kmsKeyArn });
    const metadataCheck = await sh(
      `aws secretsmanager describe-secret --secret-id "${metadataSecretsNs}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" 2>/dev/null`,
    );
    if (metadataCheck.code === 0) {
      await sh(
        `aws secretsmanager put-secret-value --secret-id "${metadataSecretsNs}" --secret-string '${metadataJson}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
      );
    } else {
      await sh(
        `aws secretsmanager create-secret --name "${metadataSecretsNs}" --description "AWS metadata" --tags Key=Environment,Value=development Key=WorkspaceId,Value="${workspaceId}" Key=Owner,Value="core identity" --secret-string '${metadataJson}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`,
      );
    }

    await addOrUpdateEnvVar(
      "COGNITO_SECRETS_NAMESPACE",
      cognitoSecretsNs,
      PERSONAL_ENV_RC_PATH,
    );
    await addOrUpdateEnvVar(
      "METADATA_SECRETS_NAMESPACE",
      metadataSecretsNs,
      PERSONAL_ENV_RC_PATH,
    );

    return { success: true, duration: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      error: getErrorMessage(e),
      duration: Date.now() - start,
    };
  }
}
