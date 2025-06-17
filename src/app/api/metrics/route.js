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
    .replace(/\\n/g, '\n')  // Replace literal \n with actual newlines
    .replace(/"/g, '')      // Remove any quotes
    .trim();                // Remove whitespace

  // Ensure proper formatting
  if (!privateKey.includes('\n')) {
    // If no newlines, add them manually at proper positions
    privateKey = privateKey
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
    
    // Add newlines every 64 characters for the key body
    const keyBody = privateKey.split('\n')[1].replace('-----END PRIVATE KEY-----', '');
    const formattedKeyBody = keyBody.match(/.{1,64}/g)?.join('\n') || keyBody;
    privateKey = `-----BEGIN PRIVATE KEY-----\n${formattedKeyBody}\n-----END PRIVATE KEY-----`;
  }

  console.log("🔑 Private key format check:", {
    hasBeginMarker: privateKey.includes('-----BEGIN PRIVATE KEY-----'),
    hasEndMarker: privateKey.includes('-----END PRIVATE KEY-----'),
    hasNewlines: privateKey.includes('\n'),
    length: privateKey.length
  });

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

export async function GET(request) {
  try {
    // Check if client is initialized
    if (!client) {
      console.error("MetricServiceClient not initialized");
      return NextResponse.json({
        hourly: generateFallbackData(true),
        daily: generateFallbackData(false)
      });
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      console.error("Project ID not found");
      return NextResponse.json({
        hourly: generateFallbackData(true),
        daily: generateFallbackData(false)
      });
    }

    const projectPath = client.projectPath(projectId);
    const endTime = Math.floor(Date.now() / 1000);

    // Fetch both 1-hour and 24-hour data
    const [hourlyData, dailyData] = await Promise.all([
      fetchMetricsData(client, projectPath, endTime - 3600, endTime, 300), // 1 hour, 5-min intervals
      fetchMetricsData(client, projectPath, endTime - 86400, endTime, 3600) // 24 hours, 1-hour intervals
    ]);

    return NextResponse.json({
      hourly: hourlyData,
      daily: dailyData
    });
  } catch (error) {
    console.error("❌ Error fetching metrics:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      stack: error.stack,
    });

    // Return fallback data on error
    return NextResponse.json({
      hourly: generateFallbackData(true),
      daily: generateFallbackData(false)
    });
  }
}

async function fetchMetricsData(client, projectPath, startTime, endTime, alignmentPeriod) {
  console.log(`📊 Fetching metrics from ${new Date(startTime * 1000)} to ${new Date(endTime * 1000)}`);
  console.log(`⏰ Alignment period: ${alignmentPeriod} seconds`);

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
    filter: 'metric.type="cloudfunctions.googleapis.com/function/execution_count"',
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
    console.log("🔍 Fetching Firestore reads...");
    const [firestoreReadsTimeSeries] = await client.listTimeSeries(firestoreReadsRequest);
    
    console.log("✍️ Fetching Firestore writes...");
    const [firestoreWritesTimeSeries] = await client.listTimeSeries(firestoreWritesRequest);
    
    console.log("⚡ Fetching Functions metrics...");
    const [functionsTimeSeries] = await client.listTimeSeries(functionsRequest);

    // Debug logs
    console.log("📊 Firestore reads data points:", firestoreReadsTimeSeries?.length || 0);
    console.log("✍️ Firestore writes data points:", firestoreWritesTimeSeries?.length || 0);
    console.log("⚡ Functions data points:", functionsTimeSeries?.length || 0);

    // Process the data
    const processedData = processMetricsData(
      firestoreReadsTimeSeries || [],
      firestoreWritesTimeSeries || [],
      functionsTimeSeries || [],
      alignmentPeriod
    );

    console.log("📈 Processed data sample:", processedData.slice(0, 3));
    return processedData;
  } catch (error) {
    console.error("❌ Error in fetchMetricsData:", error);
    throw error;
  }
}

function processMetricsData(firestoreReadsData, firestoreWritesData, functionsData, alignmentPeriod) {
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

  console.log("📅 Time slots initialized:", Array.from(dataMap.keys()));

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
      const [hour, minute] = timeSlot.split(':').map(Number);
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
    { data: firestoreReadsData, key: 'reads', emoji: '📊' },
    { data: firestoreWritesData, key: 'writes', emoji: '✍️' },
    { data: functionsData, key: 'functions', emoji: '⚡' }
  ];

  dataSources.forEach(({ data, key, emoji }) => {
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
                
                console.log(`${emoji} ${key}: ${value}/sec = ${countPerInterval} per ${alignmentPeriod}s at ${new Date(timestamp * 1000).toLocaleTimeString()} -> slot ${timeSlot}`);
              }
            }
          });
        }
      });
    }
  });

  const result = Array.from(dataMap.values());
  console.log("📈 Final processed data:", result);
  return result;
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
      reads: Math.max(0, Math.round(baseReads + (Math.random() - 0.5) * 10 * scale)),
      writes: Math.max(0, Math.round(baseWrites + (Math.random() - 0.5) * 4 * scale)),
      functions: Math.max(0, Math.round(baseFunctions + (Math.random() - 0.5) * 3 * scale)),
    });
  }

  return data;
}