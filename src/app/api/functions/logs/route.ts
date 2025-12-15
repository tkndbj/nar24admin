import { Logging } from "@google-cloud/logging";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminAuth } from "@/lib/auth";
import { apiRateLimiter } from "@/lib/rate-limit";

let loggingClient: Logging | null = null;

interface LogEntry {
  timestamp: string;
  severity: string;
  message: string;
  executionId?: string;
  httpRequest?: {
    method?: string;
    status?: number;
    responseSize?: string;
    latency?: string;
    userAgent?: string;
    url?: string;
  };
}

try {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error("Missing required credentials");
  }

  privateKey = privateKey
    .replace(/\\n/g, "\n")
    .replace(/"/g, "")
    .trim();

  if (!privateKey.includes("\n")) {
    privateKey = privateKey
      .replace("-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\n")
      .replace("-----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----");

    const keyBody = privateKey
      .split("\n")[1]
      .replace("-----END PRIVATE KEY-----", "");
    const formattedKeyBody = keyBody.match(/.{1,64}/g)?.join("\n") || keyBody;
    privateKey = `-----BEGIN PRIVATE KEY-----\n${formattedKeyBody}\n-----END PRIVATE KEY-----`;
  }

  loggingClient = new Logging({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: privateKey,
    },
  });

  console.log("✅ Logging client initialized successfully");
} catch (error) {
  console.error("❌ Failed to initialize Logging client:", error);
}

// Helper to format bytes
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper to format latency
function formatLatency(latency: unknown): string {
  if (!latency) return "";
  
  // Handle string format like "1.5s"
  if (typeof latency === "string") {
    const match = latency.match(/^([\d.]+)s$/);
    if (match) {
      const seconds = parseFloat(match[1]);
      if (seconds < 1) {
        return `${Math.round(seconds * 1000)} ms`;
      }
      return `${seconds.toFixed(1)} s`;
    }
    return latency;
  }
  
  // Handle object format { seconds: "1", nanos: 500000000 }
  if (typeof latency === "object" && latency !== null) {
    const latencyObj = latency as Record<string, unknown>;
    let totalSeconds = 0;
    
    if (latencyObj.seconds) {
      totalSeconds += Number(latencyObj.seconds);
    }
    if (latencyObj.nanos) {
      totalSeconds += Number(latencyObj.nanos) / 1e9;
    }
    
    if (totalSeconds < 1) {
      return `${Math.round(totalSeconds * 1000)} ms`;
    }
    return `${totalSeconds.toFixed(1)} s`;
  }
  
  return "";
}

// Helper to extract short user agent
function formatUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return "";
  // Extract browser name and version
  if (userAgent.includes("Chrome/")) {
    const match = userAgent.match(/Chrome\/(\d+)/);
    return match ? `Chrome ${match[1]}` : "Chrome";
  }
  if (userAgent.includes("Firefox/")) {
    const match = userAgent.match(/Firefox\/(\d+)/);
    return match ? `Firefox ${match[1]}` : "Firefox";
  }
  if (userAgent.includes("Safari/")) {
    const match = userAgent.match(/Version\/(\d+)/);
    return match ? `Safari ${match[1]}` : "Safari";
  }
  return "";
}

// Helper to extract message from nested jsonPayload
function extractMessage(jsonPayload: Record<string, unknown>): string | null {
  // Direct message field
  if (typeof jsonPayload.message === "string") {
    return jsonPayload.message;
  }
  
  // Nested in fields.message.stringValue (Firestore/Firebase format)
  if (jsonPayload.fields && typeof jsonPayload.fields === "object") {
    const fields = jsonPayload.fields as Record<string, unknown>;
    if (fields.message && typeof fields.message === "object") {
      const messageField = fields.message as Record<string, unknown>;
      if (typeof messageField.stringValue === "string") {
        return messageField.stringValue;
      }
    }
  }
  
  return null;
}

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await apiRateLimiter.check(request);
  if (!rateLimitResult.success && rateLimitResult.response) {
    return rateLimitResult.response;
  }

  // Verify admin authentication
  const authResult = await verifyAdminAuth(request);
  if (!authResult.success) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const functionName = searchParams.get("name");
    const beforeTimestamp = searchParams.get("before");
    const pageSize = 20;

    if (!functionName) {
      return NextResponse.json({ error: "Function name required" }, { status: 400 });
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!projectId || !loggingClient) {
      console.error("Missing project ID or logging client not initialized");
      return NextResponse.json({
        logs: [],
        nextCursor: null,
        error: "Logging client not initialized"
      });
    }

    // Build filter - use lowercase service name for Cloud Run
    const serviceNameLower = functionName.toLowerCase();
    let filter = `(resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceNameLower}") OR (resource.type="cloud_function" AND resource.labels.function_name="${functionName}")`;
    
    if (beforeTimestamp) {
      filter += ` AND timestamp < "${beforeTimestamp}"`;
    }

    console.log("📋 Fetching logs with filter:", filter);

    const [entries] = await loggingClient.getEntries({
      filter,
      pageSize,
      orderBy: "timestamp desc",
    });

    console.log("✅ Found", entries.length, "log entries");

    const logs: LogEntry[] = entries.map((entry) => {
      const metadata = entry.metadata as Record<string, unknown> | undefined;
      const data = entry.data as Record<string, unknown> | string | undefined;
      
      let message = "";
      let httpRequest: LogEntry["httpRequest"] | undefined;

      // Handle textPayload (most common for function logs)
      if (metadata?.textPayload) {
        message = String(metadata.textPayload);
      }
      // Handle jsonPayload
      else if (metadata?.jsonPayload) {
        const jsonPayload = metadata.jsonPayload as Record<string, unknown>;
        const extractedMessage = extractMessage(jsonPayload);
        if (extractedMessage) {
          message = extractedMessage;
        } else {
          message = JSON.stringify(jsonPayload, null, 2);
        }
      }
    
      // Handle httpRequest logs
else if (metadata?.httpRequest) {
  const req = metadata.httpRequest as Record<string, unknown>;
  const method = req.requestMethod as string || "";
  const status = req.status as number || 0;
  const responseSize = formatBytes(Number(req.responseSize) || 0);
  const latency = formatLatency(req.latency);  // <-- Change this line (remove "as string")
  const userAgent = formatUserAgent(req.userAgent as string);
  const url = req.requestUrl as string || "";
  
  httpRequest = {
    method,
    status,
    responseSize,
    latency,
    userAgent,
    url,
  };
  
  // Format like Google: "POST 200 427 B 1.5 s Chrome 142 https://..."
  message = [method, status, responseSize, latency, userAgent, url]
    .filter(Boolean)
    .join(" ");
}
      // Handle protoPayload (audit logs)
      else if (metadata?.protoPayload) {
        const proto = metadata.protoPayload as Record<string, unknown>;
        const serviceName = proto.serviceName as string || "";
        const methodName = proto.methodName as string || "";
        
        // Extract the action name from methodName (e.g., "ReplaceInternalService" from full path)
        let action = methodName;
        if (methodName.includes(".")) {
          const parts = methodName.split(".");
          action = parts[parts.length - 1];
        }
        if (methodName.includes("/")) {
          const parts = methodName.split("/");
          action = parts[parts.length - 1];
        }
        
        // Format service name nicely
        let service = serviceName;
        if (serviceName === "run.googleapis.com") {
          service = "Cloud Run";
        } else if (serviceName === "cloudfunctions.googleapis.com") {
          service = "Cloud Functions";
        }
        
        if (service && action) {
          message = `${service} ${action}`;
        } else {
          message = "(Audit log)";
        }
      }
      // Fallback to data field
      else if (typeof data === "string") {
        message = data;
      } else if (data && typeof data === "object") {
        // Check if it's a Buffer-like object (skip binary data)
        if ("type" in data && data.type === "Buffer") {
          message = "(Binary audit log data)";
        } else if ("message" in data && typeof data.message === "string") {
          message = data.message;
        } else if ("textPayload" in data && typeof data.textPayload === "string") {
          message = data.textPayload;
        } else {
          const extractedMessage = extractMessage(data);
          if (extractedMessage) {
            message = extractedMessage;
          } else {
            message = JSON.stringify(data, null, 2);
          }
        }
      }

      // Extract execution ID from labels
      const labels = (metadata?.labels || {}) as Record<string, string>;
      const executionId = labels["execution_id"] || labels["instanceId"] || undefined;

      // Get timestamp
      const timestamp = metadata?.timestamp 
        ? String(metadata.timestamp) 
        : new Date().toISOString();

      // Get severity
      const severity = String(metadata?.severity || "DEFAULT");

      return {
        timestamp,
        severity,
        message: message || "(empty log entry)",
        executionId,
        httpRequest,
      };
    });

    // Use the last log's timestamp as cursor for next page
    const nextCursor = logs.length === pageSize ? logs[logs.length - 1].timestamp : null;

    return NextResponse.json({
      logs,
      nextCursor,
    });
  } catch (error) {
    console.error("❌ Error fetching logs:", error);

    // Return empty array instead of fake data
    return NextResponse.json({
      logs: [],
      nextCursor: null,
      error: String(error),
    });
  }
}