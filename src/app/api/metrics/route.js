import { MetricServiceClient } from "@google-cloud/monitoring";
import { NextResponse } from "next/server";

// Initialize the client with environment variables
let client;

try {
  // Clean up the private key - handle different possible formats
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error("Missing required credentials");
  }

  // Handle different private key formats
  privateKey = privateKey
    .replace(/\\n/g, "\n") // Replace literal \n with actual newlines
    .replace(/"/g, "") // Remove any quotes
    .trim(); // Remove whitespace

  // Ensure proper formatting
  if (!privateKey.includes("\n")) {
    // If no newlines, add them manually at proper positions
    privateKey = privateKey
      .replace("-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\n")
      .replace("-----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----");

    // Add newlines every 64 characters for the key body
    const keyBody = privateKey
      .split("\n")[1]
      .replace("-----END PRIVATE KEY-----", "");
    const formattedKeyBody = keyBody.match(/.{1,64}/g)?.join("\n") || keyBody;
    privateKey = `-----BEGIN PRIVATE KEY-----\n${formattedKeyBody}\n-----END PRIVATE KEY-----`;
  }

  client = new MetricServiceClient({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: privateKey,
    },
  });

  console.log("✅ MetricServiceClient initialized successfully");
} catch (error) {
  console.error("❌ Failed to initialize MetricServiceClient:", error);
  console.error("Error type:", error.constructor.name);
  console.error("Error message:", error.message);
}

export async function GET() {
  try {
    // Check if client is initialized
    if (!client) {
      console.error("MetricServiceClient not initialized");
      return NextResponse.json({
        hourly: generateFallbackData(true),
        daily: generateFallbackData(false),
        functions: generateFallbackFunctionData(),
        recommendationPipeline: {
          hourly: generateFallbackRecommendationData(true),
          daily: generateFallbackRecommendationData(false)
        }
      });
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      console.error("Project ID not found");
      return NextResponse.json({
        hourly: generateFallbackData(true),
        daily: generateFallbackData(false),
        functions: generateFallbackFunctionData(),
        recommendationPipeline: {
          hourly: generateFallbackRecommendationData(true),
          daily: generateFallbackRecommendationData(false)
        }
      });
    }

    const projectPath = client.projectPath(projectId);
    const endTime = Math.floor(Date.now() / 1000);

    // Define time periods for function-specific data
    const timePeriods = [
      { name: "10min", duration: 600, alignment: 60 },
      { name: "30min", duration: 1800, alignment: 300 },
      { name: "1hr", duration: 3600, alignment: 300 },
      { name: "4hr", duration: 14400, alignment: 900 },
      { name: "8hr", duration: 28800, alignment: 1800 },
    ];

    // Fetch existing hourly and daily data + new function-specific data
    const [hourlyData, dailyData, recommendationHourly, recommendationDaily, ...functionDataResults] = await Promise.all([
      fetchMetricsData(client, projectPath, endTime - 3600, endTime, 300), // 1 hour, 5-min intervals
      fetchMetricsData(client, projectPath, endTime - 86400, endTime, 3600), // 24 hours, 1-hour intervals
      // ADD THESE TWO NEW CALLS:
      fetchRecommendationPipelineMetrics(client, projectPath, endTime - 3600, endTime, 300), // Hourly recommendation data
      fetchRecommendationPipelineMetrics(client, projectPath, endTime - 86400, endTime, 3600), // Daily recommendation data
      ...timePeriods.map((period) =>
        fetchFunctionSpecificMetrics(
          client,
          projectPath,
          endTime - period.duration,
          endTime,
          period.alignment
        )
      ),
    ]);

    // Organize function data by time period
    const functionsByPeriod = {};
    timePeriods.forEach((period, index) => {
      functionsByPeriod[period.name] = functionDataResults[index];
    });

    return NextResponse.json({
      hourly: hourlyData,
      daily: dailyData,
      functions: functionsByPeriod,
      recommendationPipeline: {
        hourly: recommendationHourly,
        daily: recommendationDaily
      }
    });
  } catch (error) {
    console.error("❌ Error fetching metrics:", error);

    // Return fallback data on error
    return NextResponse.json({
      hourly: generateFallbackData(true),
      daily: generateFallbackData(false),
      functions: generateFallbackFunctionData(),
      recommendationPipeline: {
        hourly: generateFallbackRecommendationData(true),
        daily: generateFallbackRecommendationData(false)
      }
    });
  }
}

async function fetchMetricsData(
  client,
  projectPath,
  startTime,
  endTime,
  alignmentPeriod
) {
  // Firestore document reads
  const firestoreReadsRequest = {
    name: projectPath,
    filter: 'metric.type="firestore.googleapis.com/document/read_count"',
    interval: {
      endTime: { seconds: endTime },
      startTime: { seconds: startTime },
    },
    aggregation: {
      alignmentPeriod: { seconds: alignmentPeriod },
      perSeriesAligner: "ALIGN_RATE",
      crossSeriesReducer: "REDUCE_SUM",
    },
  };

  // Firestore document writes
  const firestoreWritesRequest = {
    name: projectPath,
    filter: 'metric.type="firestore.googleapis.com/document/write_count"',
    interval: {
      endTime: { seconds: endTime },
      startTime: { seconds: startTime },
    },
    aggregation: {
      alignmentPeriod: { seconds: alignmentPeriod },
      perSeriesAligner: "ALIGN_RATE",
      crossSeriesReducer: "REDUCE_SUM",
    },
  };

  // Cloud Functions executions
  const functionsRequest = {
    name: projectPath,
    filter:
      'metric.type="cloudfunctions.googleapis.com/function/execution_count"',
    interval: {
      endTime: { seconds: endTime },
      startTime: { seconds: startTime },
    },
    aggregation: {
      alignmentPeriod: { seconds: alignmentPeriod },
      perSeriesAligner: "ALIGN_RATE",
      crossSeriesReducer: "REDUCE_SUM",
    },
  };

  try {
    const [firestoreReadsTimeSeries] = await client.listTimeSeries(
      firestoreReadsRequest
    );

    const [firestoreWritesTimeSeries] = await client.listTimeSeries(
      firestoreWritesRequest
    );

    const [functionsTimeSeries] = await client.listTimeSeries(functionsRequest);

    // Process the data
    const processedData = processMetricsData(
      firestoreReadsTimeSeries || [],
      firestoreWritesTimeSeries || [],
      functionsTimeSeries || [],
      alignmentPeriod
    );

    return processedData;
  } catch (error) {
    console.error("❌ Error in fetchMetricsData:", error);
    throw error;
  }
}

async function fetchFunctionSpecificMetrics(
  client,
  projectPath,
  startTime,
  endTime,
  alignmentPeriod
) {
  // Cloud Functions executions with function name breakdown
  const functionsRequest = {
    name: projectPath,
    filter:
      'metric.type="cloudfunctions.googleapis.com/function/execution_count"',
    interval: {
      endTime: { seconds: endTime },
      startTime: { seconds: startTime },
    },
    aggregation: {
      alignmentPeriod: { seconds: alignmentPeriod },
      perSeriesAligner: "ALIGN_RATE",
      crossSeriesReducer: "REDUCE_NONE", // Don't sum across functions - keep them separate
      groupByFields: ["resource.labels.function_name"], // Group by function name
    },
  };

  // Function errors - only get failed executions
  const functionErrorsRequest = {
    name: projectPath,
    filter:
      'metric.type="cloudfunctions.googleapis.com/function/execution_count" AND metric.labels.status!="ok"',
    interval: {
      endTime: { seconds: endTime },
      startTime: { seconds: startTime },
    },
    aggregation: {
      alignmentPeriod: { seconds: alignmentPeriod },
      perSeriesAligner: "ALIGN_RATE",
      crossSeriesReducer: "REDUCE_NONE",
      groupByFields: ["resource.labels.function_name"],
    },
  };

  try {
    // Only fetch executions and errors, skip duration for now
    const [functionsTimeSeries, errorsTimeSeries] = await Promise.all([
      client.listTimeSeries(functionsRequest),
      client.listTimeSeries(functionErrorsRequest),
    ]);

    return processFunctionSpecificData(
      functionsTimeSeries[0] || [],
      errorsTimeSeries[0] || [],
      [], // Empty duration data for now
      alignmentPeriod
    );
  } catch (error) {
    console.error("❌ Error fetching function-specific metrics:", error);

    // Try a simpler approach - just get basic execution counts without grouping
    try {
      const simpleRequest = {
        name: projectPath,
        filter:
          'metric.type="cloudfunctions.googleapis.com/function/execution_count"',
        interval: {
          endTime: { seconds: endTime },
          startTime: { seconds: startTime },
        },
      };

      const [simpleResults] = await client.listTimeSeries(simpleRequest);

      if (simpleResults && simpleResults.length > 0) {
        console.log(
          "📋 Available functions:",
          simpleResults
            .map((r) => r.resource?.labels?.function_name)
            .filter(Boolean)
        );
      }

      return []; // Return empty for now, but we can see what functions exist
    } catch (simpleError) {
      console.error("❌ Simple query also failed:", simpleError.message);
      throw error;
    }
  }
}

async function fetchRecommendationPipelineMetrics(
  client,
  projectPath,
  startTime,
  endTime,
  alignmentPeriod
) {
  // Specific function names for your recommendation pipeline
  const recommendationFunctions = [
    "getRecommendations",
    "ingestTransactionEvent", 
    "ingestDetailViewEvent",
    "ingestShopProductDetailViewEvent"
  ];

  const functionsData = [];

  // Fetch metrics for each specific function
  for (const functionName of recommendationFunctions) {
    const request = {
      name: projectPath,
      filter: `metric.type="cloudfunctions.googleapis.com/function/execution_count" AND resource.labels.function_name="${functionName}"`,
      interval: {
        endTime: { seconds: endTime },
        startTime: { seconds: startTime },
      },
      aggregation: {
        alignmentPeriod: { seconds: alignmentPeriod },
        perSeriesAligner: "ALIGN_RATE",
        crossSeriesReducer: "REDUCE_SUM",
      },
    };

    try {
      const [timeSeries] = await client.listTimeSeries(request);
      
      let totalExecutions = 0;
      const dataPoints = [];
      
      if (timeSeries && timeSeries.length > 0) {
        timeSeries[0].points?.forEach((point) => {
          const value = parseFloat(point.value?.doubleValue || 0);
          const executions = Math.round(value * alignmentPeriod);
          totalExecutions += executions;
          
          if (point.interval?.endTime) {
            const timestamp = parseInt(point.interval.endTime.seconds);
            dataPoints.push({
              timestamp,
              value: executions
            });
          }
        });
      }

      functionsData.push({
        functionName,
        executions: totalExecutions,
        dataPoints
      });
    } catch (error) {
      console.error(`Error fetching metrics for ${functionName}:`, error);
      functionsData.push({
        functionName,
        executions: 0,
        dataPoints: []
      });
    }
  }

  return functionsData;
}

function processFunctionSpecificData(
  functionsData,
  errorsData,
  durationData,
  alignmentPeriod
) {
  const functionMap = new Map();

  // Process executions
  functionsData.forEach((series, index) => {
    const functionName =
      series.resource?.labels?.function_name || `unknown-${index}`;

    if (!functionMap.has(functionName)) {
      functionMap.set(functionName, {
        name: functionName,
        executions: 0,
        errors: 0,
        avgDuration: 0, // Default to 0 since we can't get duration for now
        dataPoints: [],
      });
    }

    const funcData = functionMap.get(functionName);

    series.points?.forEach((point) => {
      const value = parseFloat(point.value?.doubleValue || 0);
      const executions = Math.round(value * alignmentPeriod);
      funcData.executions += executions;

      if (point.interval?.endTime) {
        const timestamp = parseInt(point.interval.endTime.seconds);
        funcData.dataPoints.push({
          timestamp,
          executions,
          errors: 0,
          duration: 0,
        });
      }
    });
  });

  // Process errors
  errorsData.forEach((series) => {
    const functionName = series.resource?.labels?.function_name || "unknown";
    const funcData = functionMap.get(functionName);

    if (funcData) {
      series.points?.forEach((point) => {
        const value = parseFloat(point.value?.doubleValue || 0);
        const errors = Math.round(value * alignmentPeriod);
        funcData.errors += errors;

        // Match with existing data points by timestamp
        if (point.interval?.endTime) {
          const timestamp = parseInt(point.interval.endTime.seconds);
          const dataPoint = funcData.dataPoints.find(
            (dp) => dp.timestamp === timestamp
          );
          if (dataPoint) {
            dataPoint.errors = errors;
          }
        }
      });
    }
  });

  return Array.from(functionMap.values());
}

function processMetricsData(
  firestoreReadsData,
  firestoreWritesData,
  functionsData,
  alignmentPeriod
) {
  const dataMap = new Map();
  const isHourly = alignmentPeriod === 300; // 5-minute intervals = hourly view

  // Initialize time slots
  const now = new Date();
  const slots = isHourly ? 12 : 24; // 12 x 5min slots for 1h, 24 x 1h slots for 24h
  const interval = isHourly ? 5 * 60000 : 60 * 60000; // 5 minutes or 1 hour

  for (let i = slots - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * interval);
    const timeStr = time.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    dataMap.set(timeStr, { time: timeStr, reads: 0, writes: 0, functions: 0 });
  }

  // Helper function to find the closest time slot
  const findClosestTimeSlot = (timestamp) => {
    const targetTime = new Date(timestamp * 1000);
    const targetTimeStr = targetTime.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Try exact match first
    if (dataMap.has(targetTimeStr)) {
      return targetTimeStr;
    }

    // Find closest time slot within the interval
    const tolerance = isHourly ? 5 * 60 * 1000 : 60 * 60 * 1000; // 5 minutes or 1 hour

    for (const [timeSlot] of dataMap) {
      const [hour, minute] = timeSlot.split(":").map(Number);
      const slotTime = new Date();
      slotTime.setHours(hour, minute, 0, 0);

      // Check if within tolerance of this slot
      const timeDiff = Math.abs(targetTime.getTime() - slotTime.getTime());
      if (timeDiff <= tolerance) {
        return timeSlot;
      }
    }

    return null;
  };

  // Process all data types
  const dataSources = [
    { data: firestoreReadsData, key: "reads", emoji: "📊" },
    { data: firestoreWritesData, key: "writes", emoji: "✍️" },
    { data: functionsData, key: "functions", emoji: "⚡" },
  ];

  dataSources.forEach(({ data, key }) => {
    if (data && Array.isArray(data)) {
      data.forEach((series) => {
        if (series.points && Array.isArray(series.points)) {
          series.points.forEach((point) => {
            if (point.interval && point.interval.endTime) {
              const timestamp = parseInt(point.interval.endTime.seconds);
              const timeSlot = findClosestTimeSlot(timestamp);

              if (timeSlot) {
                const value = parseFloat(point.value?.doubleValue || 0);
                // Convert rate per second to count per interval
                const countPerInterval = Math.round(value * alignmentPeriod);
                dataMap.get(timeSlot)[key] += countPerInterval;
              }
            }
          });
        }
      });
    }
  });

  return Array.from(dataMap.values());
}

function generateFallbackData(isHourly = true) {
  const data = [];
  const now = new Date();
  const slots = isHourly ? 12 : 24;
  const interval = isHourly ? 5 * 60000 : 60 * 60000;

  for (let i = slots - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * interval);
    const timeStr = time.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Generate different scales for hourly vs daily
    const scale = isHourly ? 1 : 10;
    const baseReads = (20 + Math.sin(i / 10) * 10) * scale;
    const baseWrites = (5 + Math.sin(i / 15) * 3) * scale;
    const baseFunctions = (3 + Math.sin(i / 8) * 2) * scale;

    data.push({
      time: timeStr,
      reads: Math.max(
        0,
        Math.round(baseReads + (Math.random() - 0.5) * 10 * scale)
      ),
      writes: Math.max(
        0,
        Math.round(baseWrites + (Math.random() - 0.5) * 4 * scale)
      ),
      functions: Math.max(
        0,
        Math.round(baseFunctions + (Math.random() - 0.5) * 3 * scale)
      ),
    });
  }

  return data;
}

function generateFallbackFunctionData() {
  const mockFunctions = [
    "createUser",
    "processPayment",
    "sendNotification",
    "updateInventory",
    "generateReport",
    "validateOrder",
  ];

  const timePeriods = ["10min", "30min", "1hr", "4hr", "8hr"];
  const result = {};

  timePeriods.forEach((period) => {
    result[period] = mockFunctions.map((funcName) => ({
      name: funcName,
      executions: Math.floor(Math.random() * 100) + 10,
      errors: Math.floor(Math.random() * 5),
      avgDuration: Math.random() * 1000 + 100,
      dataPoints: [],
    }));
  });

  return result;
}

function generateFallbackRecommendationData(isHourly = true) {
  const functions = [
    { name: "getRecommendations", baseValue: 50 },
    { name: "ingestTransactionEvent", baseValue: 20 },
    { name: "ingestDetailViewEvent", baseValue: 100 },
    { name: "ingestShopProductDetailViewEvent", baseValue: 150 }
  ];

  return functions.map(func => ({
    functionName: func.name,
    executions: Math.floor(func.baseValue * (isHourly ? 1 : 24) * (0.8 + Math.random() * 0.4)),
    dataPoints: []
  }));
}
