/**
 * Swarm Compute — Azure Virtual Machines Provider
 *
 * Uses Azure VMs for lifecycle, Run Command for script execution,
 * and Boot Diagnostics as a fallback screenshot source.
 * Desktop access is via in-guest VNC + noVNC stack.
 */

import type { ComputeProvider } from "../provider";
import type {
  InstanceConfig,
  ProviderResult,
  ActionEnvelope,
  ActionResult,
  SizeKey,
  Region,
} from "../types";
import { PROVIDER_SIZE_MAP, PROVIDER_REGION_MAP, PROVIDER_BASE_IMAGES } from "../types";

export class AzureComputeProvider implements ComputeProvider {
  readonly name = "azure";

  private get subscriptionId(): string {
    return process.env.AZURE_SUBSCRIPTION_ID || "";
  }

  private get resourceGroup(): string {
    return process.env.AZURE_RESOURCE_GROUP || "swarm-compute";
  }

  private resolveLocation(region: Region): string {
    return PROVIDER_REGION_MAP.azure[region] || "eastus";
  }

  private resolveVmSize(sizeKey: SizeKey): string {
    return PROVIDER_SIZE_MAP.azure[sizeKey] || "Standard_B2s";
  }

  private async getCredential() {
    const { DefaultAzureCredential } = await import("@azure/identity");
    return new DefaultAzureCredential();
  }

  async createInstance(config: InstanceConfig): Promise<ProviderResult> {
    const { ComputeManagementClient } = await import("@azure/arm-compute");
    const credential = await this.getCredential();
    const client = new ComputeManagementClient(credential, this.subscriptionId);

    const location = config.providerRegion || this.resolveLocation(config.region);
    const vmSize = config.providerInstanceType || this.resolveVmSize(config.sizeKey);
    const vmName = `swarm-${config.name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64);

    // Parse image reference (publisher:offer:sku:version)
    const imageRef = (config.providerImage || PROVIDER_BASE_IMAGES.azure).split(":");

    await client.virtualMachines.beginCreateOrUpdateAndWait(this.resourceGroup, vmName, {
      location,
      hardwareProfile: { vmSize },
      osProfile: {
        computerName: vmName.slice(0, 15),
        adminUsername: "swarm",
        adminPassword: `Swarm${Date.now()}!`, // Auto-generated, access via Run Command
        customData: Buffer.from(this.buildCloudInit(config)).toString("base64"),
        linuxConfiguration: {
          disablePasswordAuthentication: false,
        },
      },
      storageProfile: {
        imageReference: {
          publisher: imageRef[0],
          offer: imageRef[1],
          sku: imageRef[2],
          version: imageRef[3] || "latest",
        },
        osDisk: {
          createOption: "FromImage",
          managedDisk: { storageAccountType: "Premium_LRS" },
          diskSizeGB: config.diskGb,
          deleteOption: config.persistenceEnabled ? "Detach" : "Delete",
        },
      },
      networkProfile: {
        networkInterfaces: [{
          // Assumes a NIC is pre-created or uses a default VNet
          // In production, create NIC + public IP dynamically
          id: `/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${vmName}-nic`,
        }],
      },
      diagnosticsProfile: {
        bootDiagnostics: { enabled: true },
      },
      tags: {
        "swarm:managed": "true",
        "swarm:size": config.sizeKey,
      },
    });

    return {
      providerInstanceId: vmName,
      status: "starting",
      providerInstanceType: vmSize,
      providerRegion: location,
      metadata: { resourceGroup: this.resourceGroup },
    };
  }

  async startInstance(providerInstanceId: string): Promise<void> {
    const { ComputeManagementClient } = await import("@azure/arm-compute");
    const credential = await this.getCredential();
    const client = new ComputeManagementClient(credential, this.subscriptionId);
    await client.virtualMachines.beginStartAndWait(this.resourceGroup, providerInstanceId);
  }

  async stopInstance(providerInstanceId: string): Promise<void> {
    const { ComputeManagementClient } = await import("@azure/arm-compute");
    const credential = await this.getCredential();
    const client = new ComputeManagementClient(credential, this.subscriptionId);
    await client.virtualMachines.beginDeallocateAndWait(this.resourceGroup, providerInstanceId);
  }

  async restartInstance(providerInstanceId: string): Promise<void> {
    const { ComputeManagementClient } = await import("@azure/arm-compute");
    const credential = await this.getCredential();
    const client = new ComputeManagementClient(credential, this.subscriptionId);
    await client.virtualMachines.beginRestartAndWait(this.resourceGroup, providerInstanceId);
  }

  async deleteInstance(providerInstanceId: string): Promise<void> {
    const { ComputeManagementClient } = await import("@azure/arm-compute");
    const credential = await this.getCredential();
    const client = new ComputeManagementClient(credential, this.subscriptionId);
    await client.virtualMachines.beginDeleteAndWait(this.resourceGroup, providerInstanceId);
  }

  async takeScreenshot(providerInstanceId: string): Promise<{ url: string; base64?: string }> {
    // Azure Boot Diagnostics provides screenshots as a debug/fallback feature
    const { ComputeManagementClient } = await import("@azure/arm-compute");
    const credential = await this.getCredential();
    const client = new ComputeManagementClient(credential, this.subscriptionId);

    try {
      const result = await client.virtualMachines.retrieveBootDiagnosticsData(
        this.resourceGroup,
        providerInstanceId,
      );
      // Boot diagnostics returns a SAS URL for the screenshot
      return { url: (result as Record<string, unknown>).screenshotBlobUri as string || "" };
    } catch {
      // Fallback: use Run Command to capture from in-guest VNC
      const cmdResult = await this.runCommand(
        providerInstanceId,
        "DISPLAY=:1 import -window root -quality 80 /tmp/ss.jpg && base64 /tmp/ss.jpg",
      );
      if (cmdResult.success && cmdResult.data?.stdout) {
        const base64 = cmdResult.data.stdout as string;
        return { url: `data:image/jpeg;base64,${base64}`, base64 };
      }
      return { url: "" };
    }
  }

  async executeAction(providerInstanceId: string, action: ActionEnvelope): Promise<ActionResult> {
    const start = Date.now();

    switch (action.actionType) {
      case "bash":
      case "exec": {
        const command = action.payload.command as string;
        return this.runCommand(providerInstanceId, command);
      }
      case "screenshot": {
        const data = await this.takeScreenshot(providerInstanceId);
        return { success: !!data.url, data, durationMs: Date.now() - start };
      }
      case "click":
      case "double_click":
      case "type":
      case "key":
      case "scroll":
      case "drag": {
        const xdoCmd = this.buildXdotoolCommand(action);
        return this.runCommand(providerInstanceId, xdoCmd);
      }
      case "wait": {
        const ms = (action.payload.ms as number) || 1000;
        await new Promise(r => setTimeout(r, ms));
        return { success: true, data: {}, durationMs: ms };
      }
      default:
        return { success: false, error: `Unsupported action: ${action.actionType}`, durationMs: 0 };
    }
  }

  async getVncUrl(providerInstanceId: string): Promise<string> {
    const ip = await this.getPublicIp(providerInstanceId);
    if (!ip) return "";
    return `https://${ip}:6080/vnc.html?autoconnect=true&resize=scale`;
  }

  async getTerminalUrl(providerInstanceId: string): Promise<string> {
    return `https://portal.azure.com/#@/resource/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${providerInstanceId}/serialConsole`;
  }

  async createSnapshot(providerInstanceId: string, label: string): Promise<string> {
    const { ComputeManagementClient } = await import("@azure/arm-compute");
    const credential = await this.getCredential();
    const client = new ComputeManagementClient(credential, this.subscriptionId);

    // Get the OS disk ID
    const vm = await client.virtualMachines.get(this.resourceGroup, providerInstanceId);
    const osDiskId = vm.storageProfile?.osDisk?.managedDisk?.id;
    if (!osDiskId) throw new Error("No OS disk found on VM");

    const snapshotName = `swarm-${label}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80);
    await client.snapshots.beginCreateOrUpdateAndWait(this.resourceGroup, snapshotName, {
      location: vm.location || "eastus",
      creationData: {
        createOption: "Copy",
        sourceResourceId: osDiskId,
      },
      tags: { "swarm:managed": "true" },
    });

    return snapshotName;
  }

  async cloneInstance(providerInstanceId: string, newName: string): Promise<string> {
    const snapshotId = await this.createSnapshot(providerInstanceId, "clone");
    return snapshotId;
  }

  // ── Helpers ────────────────────────────────────────────

  private async runCommand(vmName: string, command: string): Promise<ActionResult> {
    const { ComputeManagementClient } = await import("@azure/arm-compute");
    const credential = await this.getCredential();
    const client = new ComputeManagementClient(credential, this.subscriptionId);
    const start = Date.now();

    try {
      const result = await client.virtualMachines.beginRunCommandAndWait(
        this.resourceGroup,
        vmName,
        {
          commandId: "RunShellScript",
          script: [command],
        },
      );

      const output = result.value?.[0]?.message || "";
      const isError = result.value?.[0]?.code === "ComponentStatus/StdErr/succeeded";

      return {
        success: !isError,
        data: {
          stdout: isError ? "" : output,
          stderr: isError ? output : "",
          exitCode: isError ? 1 : 0,
        },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Run Command failed",
        durationMs: Date.now() - start,
      };
    }
  }

  private async getPublicIp(vmName: string): Promise<string | null> {
    const { NetworkManagementClient } = await import("@azure/arm-network");
    const credential = await this.getCredential();
    const client = new NetworkManagementClient(credential, this.subscriptionId);

    try {
      const ipName = `${vmName}-ip`;
      const result = await client.publicIPAddresses.get(this.resourceGroup, ipName);
      return result.ipAddress || null;
    } catch {
      return null;
    }
  }

  private buildCloudInit(config: InstanceConfig): string {
    return `#!/bin/bash
set -e
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y xfce4 xfce4-terminal tigervnc-standalone-server novnc websockify xdotool imagemagick
mkdir -p /root/.vnc
echo "swarmvnc" | vncpasswd -f > /root/.vnc/passwd
chmod 600 /root/.vnc/passwd
cat > /root/.vnc/xstartup << 'XSTARTUP'
#!/bin/bash
exec startxfce4
XSTARTUP
chmod +x /root/.vnc/xstartup
vncserver :1 -geometry ${config.resolutionWidth}x${config.resolutionHeight} -depth 24
websockify --web /usr/share/novnc 6080 localhost:5901 &
${config.startupScript || ""}
`;
  }

  private safeInt(val: unknown): number {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0 || n > 10000) throw new Error(`Invalid coordinate: ${val}`);
    return Math.round(n);
  }

  private shellEscape(text: string): string {
    return text.replace(/[\x00-\x1f\x7f]/g, "").replace(/'/g, "'\\''");
  }

  private safeKey(val: unknown): string {
    const key = String(val);
    if (!/^[a-zA-Z0-9_+]+$/.test(key)) throw new Error(`Invalid key: ${key}`);
    return key;
  }

  private buildXdotoolCommand(action: ActionEnvelope): string {
    const env = "DISPLAY=:1";
    switch (action.actionType) {
      case "click": {
        const x = this.safeInt(action.payload.x);
        const y = this.safeInt(action.payload.y);
        return `${env} xdotool mousemove ${x} ${y} click 1`;
      }
      case "double_click": {
        const x = this.safeInt(action.payload.x);
        const y = this.safeInt(action.payload.y);
        return `${env} xdotool mousemove ${x} ${y} click --repeat 2 1`;
      }
      case "type":
        return `${env} xdotool type --clearmodifiers '${this.shellEscape(String(action.payload.text || ""))}'`;
      case "key":
        return `${env} xdotool key ${this.safeKey(action.payload.key)}`;
      case "scroll": {
        const dir = action.payload.direction === "up" ? 4 : 5;
        const amt = this.safeInt(action.payload.amount || 3);
        return `${env} xdotool click --repeat ${amt} ${dir}`;
      }
      case "drag": {
        const from = action.payload.from as number[];
        const to = action.payload.to as number[];
        return `${env} xdotool mousemove ${this.safeInt(from[0])} ${this.safeInt(from[1])} mousedown 1 mousemove ${this.safeInt(to[0])} ${this.safeInt(to[1])} mouseup 1`;
      }
      default:
        return "echo unsupported";
    }
  }
}
