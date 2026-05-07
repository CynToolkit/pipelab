import { CloudProvider, CloudRun, CloudRunOptions } from "@pipelab/cloud";
import { ContainerInstanceManagementClient } from "@azure/arm-containerinstance";
import { DefaultAzureCredential } from "@azure/identity";
import { ShareServiceClient, StorageSharedKeyCredential } from "@azure/storage-file-share";

export interface AzureProviderOptions {
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  storageAccountName: string;
  storageAccountKey: string;
  fileShareName: string;
  image: string;
}

export class AzureProvider implements CloudProvider {
  id = "azure-aci";
  name = "Azure Container Instances";
  supportedOS: ("windows" | "linux" | "macos")[] = ["windows", "linux"];

  private client: ContainerInstanceManagementClient;
  private shareClient: ShareServiceClient;

  constructor(private options: AzureProviderOptions) {
    const credential = new DefaultAzureCredential();
    this.client = new ContainerInstanceManagementClient(credential, options.subscriptionId);

    const storageCredential = new StorageSharedKeyCredential(
      options.storageAccountName,
      options.storageAccountKey,
    );
    this.shareClient = new ShareServiceClient(
      `https://${options.storageAccountName}.file.core.windows.net`,
      storageCredential,
    );
  }

  async run(pipeline: any, options: CloudRunOptions): Promise<CloudRun> {
    const runId = `run-${Math.random().toString(36).substring(7)}`;
    const fileName = `${runId}.json`;

    // 1. Upload pipeline to File Share
    const shareName = this.options.fileShareName;
    const shareClient = this.shareClient.getShareClient(shareName);
    await shareClient.createIfNotExists();

    const directoryClient = shareClient.getDirectoryClient("");
    const fileClient = directoryClient.getFileClient(fileName);
    const content = JSON.stringify(pipeline);
    await fileClient.uploadData(Buffer.from(content));

    // 2. Create Container Group
    const containerGroupName = `pipelab-${runId}`;
    const osType = options.os === "windows" ? "Windows" : "Linux";

    const containerGroup = {
      location: this.options.location,
      osType,
      containers: [
        {
          name: "pipelab-cli",
          image: this.options.image,
          resources: {
            requests: {
              cpu: options.cpu || 1,
              memoryInGB: options.memoryInGB || 1.5,
            },
          },
          environmentVariables: [
            { name: "SUPABASE_URL", value: process.env.SUPABASE_URL },
            { name: "SUPABASE_SERVICE_ROLE_KEY", value: process.env.SUPABASE_SERVICE_ROLE_KEY },
            { name: "CLOUD_RUN_ID", value: options.cloudRunId },
          ],
          volumeMounts: [
            {
              name: "pipeline-storage",
              mountPath: "C:\\pipelab",
            },
          ],
          command: [
            "pipelab",
            "run",
            `C:\\pipelab\\${fileName}`,
            "--cloud",
            "--output",
            `C:\\pipelab\\result-${runId}.json`,
          ],
        },
      ],
      volumes: [
        {
          name: "pipeline-storage",
          azureFile: {
            shareName: shareName,
            storageAccountName: this.options.storageAccountName,
            storageAccountKey: this.options.storageAccountKey,
          },
        },
      ],
      restartPolicy: "Never",
    };

    const result = await this.client.containerGroups.beginCreateOrUpdateAndWait(
      this.options.resourceGroup,
      containerGroupName,
      containerGroup as any,
    );

    return {
      id: containerGroupName,
      providerId: this.id,
      status: "running",
      startTime: Date.now(),
    };
  }

  async getLogs(runId: string): Promise<string[]> {
    const containerGroupName = runId;
    const logs = await this.client.containerGroups.listLogs(
      this.options.resourceGroup,
      containerGroupName,
      "pipelab-cli",
    );
    return logs.content ? logs.content.split("\n") : [];
  }

  async cleanup(runId: string): Promise<void> {
    const containerGroupName = runId;
    await this.client.containerGroups.beginDeleteAndWait(
      this.options.resourceGroup,
      containerGroupName,
    );
  }
}
