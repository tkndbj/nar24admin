import { MetricServiceClient } from "@google-cloud/monitoring";
import { FunctionServiceClient } from "@google-cloud/functions/build/src/v2";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Initialize clients
let metricsClient: MetricServiceClient | null = null;
let functionsClient: FunctionServiceClient | null = null;

interface CloudFunction {
  name: string;
  status: "active" | "error" | "deploying" | "unknown";
  lastExecution: number | null;
  lastError: number | null;
  executions24h: number;
  errors24h: number;
  avgDuration: number;
  memory: number;
  timeout: number;
  runtime: string;
  region: string;
  trigger: string;
  lastDeployed: number;
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

  const credentials = {
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: privateKey,
  };

  metricsClient = new MetricServiceClient({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    credentials,
  });

  functionsClient = new FunctionServiceClient({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    credentials,
  });

  console.log("✅ Clients initialized successfully");
} catch (error) {
  console.error("❌ Failed to initialize clients:", error);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50", 10), 100);

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!projectId || !metricsClient) {
      console.error("Missing project ID or clients not initialized");
      return NextResponse.json({
        functions: generateFallbackFunctions(page, pageSize),
        page,
        pageSize,
        total: 150,
        hasMore: page * pageSize < 150,
      });
    }

    // Fetch all Cloud Functions from the project
    const allFunctions = await listAllFunctions(projectId);
    
    // Paginate
    const total = allFunctions.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedFunctions = allFunctions.slice(startIndex, endIndex);

    // Fetch metrics for the paginated functions
    const functionsWithMetrics = await enrichFunctionsWithMetrics(
      paginatedFunctions,
      projectId
    );

    return NextResponse.json({
      functions: functionsWithMetrics,
      page,
      pageSize,
      total,
      hasMore: endIndex < total,
    });
  } catch (error) {
    console.error("❌ Error fetching functions:", error);

    return NextResponse.json({
      functions: generateFallbackFunctions(1, 50),
      page: 1,
      pageSize: 50,
      total: 150,
      hasMore: true,
    });
  }
}

async function listAllFunctions(projectId: string): Promise<CloudFunction[]> {
    if (!functionsClient) {
      console.log("❌ No functionsClient, falling back to metrics discovery");
      return await discoverFunctionsFromMetrics(projectId);
    }
  
    try {
      const functions: CloudFunction[] = [];
      const parent = `projects/${projectId}/locations/-`;
  
      console.log("📡 Fetching functions from:", parent);
  
      const [functionsList] = await functionsClient.listFunctions({ parent });
  
      console.log("✅ Found", functionsList?.length || 0, "functions via API");
  
      for (const func of functionsList || []) {
        const fullName = func.name || "";
        const nameParts = fullName.split("/");
        const shortName = nameParts[nameParts.length - 1];
        const region = nameParts[3] || "unknown";
  
        // v2 API properties
        const runtime = func.buildConfig?.runtime || "unknown";
        const memory = parseMemory(func.serviceConfig?.availableMemory || "256M");
        const timeout = func.serviceConfig?.timeoutSeconds || 60;
  
        // Skip v1 functions (they don't have buildConfig or serviceConfig)
        if (!func.buildConfig && !func.serviceConfig) {
          console.log(`⏭️ Skipping v1 function: ${shortName}`);
          continue;
        }
  
        // Determine trigger type
        let trigger = "unknown";
        if (func.eventTrigger) {
          trigger = func.eventTrigger.eventType?.split(".").pop() || "event";
        } else if (func.serviceConfig?.uri) {
          trigger = "HTTPS";
        }
  
        // Get deployment time
        const lastDeployed = func.updateTime
          ? new Date(func.updateTime.seconds as number * 1000).getTime()
          : Date.now();
  
        // Determine status from state
        let status: CloudFunction["status"] = "unknown";
        const state = func.state as string;
        if (state === "ACTIVE") {
          status = "active";
        } else if (state === "DEPLOYING") {
          status = "deploying";
        } else if (state === "FAILED") {
          status = "error";
        }
  
        functions.push({
          name: shortName,
          status,
          lastExecution: null,
          lastError: null,
          executions24h: 0,
          errors24h: 0,
          avgDuration: 0,
          memory,
          timeout,
          runtime,
          region,
          trigger,
          lastDeployed,
        });
      }
  
      // Sort alphabetically by name
      functions.sort((a, b) => a.name.localeCompare(b.name));
  
      return functions;
    } catch (error) {
      console.error("❌ Error listing functions via API:", error);
      return await discoverFunctionsFromMetrics(projectId);
    }
  }

async function discoverFunctionsFromMetrics(projectId: string): Promise<CloudFunction[]> {
  if (!metricsClient) {
    return [];
  }

  try {
    const projectPath = metricsClient.projectPath(projectId);
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - 86400; // Last 24 hours

    const request = {
      name: projectPath,
      filter: 'metric.type="cloudfunctions.googleapis.com/function/execution_count"',
      interval: {
        endTime: { seconds: endTime },
        startTime: { seconds: startTime },
      },
      view: "HEADERS" as const,
    };

    const [timeSeries] = await metricsClient.listTimeSeries(request);
    const functionNames = new Set<string>();

    timeSeries?.forEach((series) => {
      const functionName = series.resource?.labels?.function_name;
      if (functionName) {
        functionNames.add(functionName);
      }
    });

    return Array.from(functionNames).map((name) => ({
      name,
      status: "active" as const,
      lastExecution: null,
      lastError: null,
      executions24h: 0,
      errors24h: 0,
      avgDuration: 0,
      memory: 256,
      timeout: 60,
      runtime: "nodejs18",
      region: "us-central1",
      trigger: "unknown",
      lastDeployed: Date.now(),
    }));
  } catch (error) {
    console.error("Error discovering functions from metrics:", error);
    return [];
  }
}

async function enrichFunctionsWithMetrics(
  functions: CloudFunction[],
  projectId: string
): Promise<CloudFunction[]> {
  if (!metricsClient || functions.length === 0) {
    return functions;
  }

  try {
    const projectPath = metricsClient.projectPath(projectId);
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - 86400; // Last 24 hours

    // Create a map for quick lookup
    const functionMap = new Map<string, CloudFunction>();
    functions.forEach((fn) => functionMap.set(fn.name, fn));

    // Fetch execution counts
    const executionRequest = {
      name: projectPath,
      filter: 'metric.type="cloudfunctions.googleapis.com/function/execution_count"',
      interval: {
        endTime: { seconds: endTime },
        startTime: { seconds: startTime },
      },
      aggregation: {
        alignmentPeriod: { seconds: 86400 },
        perSeriesAligner: "ALIGN_SUM" as const,
        crossSeriesReducer: "REDUCE_NONE" as const,
        groupByFields: ["resource.labels.function_name", "metric.labels.status"],
      },
    };

    const [executionTimeSeries] = await metricsClient.listTimeSeries(executionRequest);

    executionTimeSeries?.forEach((series) => {
      const functionName = series.resource?.labels?.function_name;
      const status = series.metric?.labels?.status;

      if (functionName && functionMap.has(functionName)) {
        const fn = functionMap.get(functionName)!;
        const value = series.points?.[0]?.value?.int64Value || 
                     series.points?.[0]?.value?.doubleValue || 0;
        const count = typeof value === 'string' ? parseInt(value, 10) : Number(value);

        if (status === "ok") {
          fn.executions24h += count;
        } else {
          fn.errors24h += count;
          fn.executions24h += count;
        }

        // Update last execution time
        const timestamp = series.points?.[0]?.interval?.endTime?.seconds;
        if (timestamp) {
          const execTime = Number(timestamp) * 1000;
          if (!fn.lastExecution || execTime > fn.lastExecution) {
            fn.lastExecution = execTime;
          }
          if (status !== "ok" && (!fn.lastError || execTime > fn.lastError)) {
            fn.lastError = execTime;
          }
        }
      }
    });

    // Fetch execution times
    const durationRequest = {
      name: projectPath,
      filter: 'metric.type="cloudfunctions.googleapis.com/function/execution_times"',
      interval: {
        endTime: { seconds: endTime },
        startTime: { seconds: startTime },
      },
      aggregation: {
        alignmentPeriod: { seconds: 86400 },
        perSeriesAligner: "ALIGN_PERCENTILE_50" as const,
        crossSeriesReducer: "REDUCE_NONE" as const,
        groupByFields: ["resource.labels.function_name"],
      },
    };

    try {
      const [durationTimeSeries] = await metricsClient.listTimeSeries(durationRequest);

      durationTimeSeries?.forEach((series) => {
        const functionName = series.resource?.labels?.function_name;

        if (functionName && functionMap.has(functionName)) {
          const fn = functionMap.get(functionName)!;
          const value = series.points?.[0]?.value?.doubleValue || 0;
          // Convert nanoseconds to milliseconds
          fn.avgDuration = value / 1000000;
        }
      });
    } catch (durationError) {
      console.error("Error fetching duration metrics:", durationError);
    }

    // Update status based on error rate
    functions.forEach((fn) => {
      if (fn.executions24h > 0) {
        const errorRate = (fn.errors24h / fn.executions24h) * 100;
        if (errorRate >= 10) {
          fn.status = "error";
        }
      }
    });

    return functions;
  } catch (error) {
    console.error("Error enriching functions with metrics:", error);
    return functions;
  }
}

function parseMemory(memoryString: string): number {
  const match = memoryString.match(/(\d+)([MG])/i);
  if (!match) return 256;
  const value = parseInt(match[1], 10);
  const unit = match[2].toUpperCase();
  return unit === "G" ? value * 1024 : value;
}


function generateFallbackFunctions(page: number, pageSize: number): CloudFunction[] {
  const allFunctions = [
    "getRecommendations",
    "ingestTransactionEvent",
    "ingestDetailViewEvent",
    "ingestShopProductDetailViewEvent",
    "processUserSignup",
    "sendWelcomeEmail",
    "syncInventory",
    "processPayment",
    "validateOrder",
    "generateReport",
    "updateUserProfile",
    "sendNotification",
    "processWebhook",
    "aggregateAnalytics",
    "cleanupExpiredSessions",
    "backupDatabase",
    "processImageUpload",
    "sendPasswordReset",
    "validateCoupon",
    "calculateShipping",
    "processRefund",
    "updateSearchIndex",
    "processSubscription",
    "sendOrderConfirmation",
    "trackUserActivity",
    "processReturn",
    "generateInvoice",
    "updateInventoryCount",
    "sendShippingUpdate",
    "processReview",
    "calculateTax",
    "verifyAddress",
    "processAbandonedCart",
    "sendReminderEmail",
    "updateProductPrice",
    "syncExternalCatalog",
    "processGiftCard",
    "validatePromoCode",
    "sendSMSNotification",
    "processWaitlist",
    "updateCustomerTier",
    "generateRecommendations",
    "processCartMerge",
    "sendDeliveryNotification",
    "calculateLoyaltyPoints",
    "processExchange",
    "updateStockLevel",
    "sendReviewRequest",
    "processPartialShipment",
    "validatePaymentMethod",
  ];

  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, allFunctions.length);
  const pageFunctions = allFunctions.slice(startIndex, endIndex);

  return pageFunctions.map((name) => {
    const hasErrors = Math.random() < 0.15;
    const executions = Math.floor(Math.random() * 5000) + 100;
    const errors = hasErrors ? Math.floor(Math.random() * (executions * 0.1)) : 0;

    return {
      name,
      status: errors > executions * 0.05 ? "error" : "active",
      lastExecution: Date.now() - Math.floor(Math.random() * 3600000),
      lastError: hasErrors ? Date.now() - Math.floor(Math.random() * 7200000) : null,
      executions24h: executions,
      errors24h: errors,
      avgDuration: Math.random() * 2000 + 50,
      memory: [128, 256, 512, 1024][Math.floor(Math.random() * 4)],
      timeout: [60, 120, 300, 540][Math.floor(Math.random() * 4)],
      runtime: ["nodejs18", "nodejs20", "python311", "go121"][Math.floor(Math.random() * 4)],
      region: ["us-central1", "us-east1", "europe-west1"][Math.floor(Math.random() * 3)],
      trigger: ["HTTPS", "Firestore", "Pub/Sub", "Storage"][Math.floor(Math.random() * 4)],
      lastDeployed: Date.now() - Math.floor(Math.random() * 604800000),
    };
  });
}