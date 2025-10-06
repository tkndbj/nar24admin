import { Timestamp } from "firebase/firestore";

// Item-level tracking for gathering phase
export interface OrderItem {
  id: string;
  orderId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  isShopProduct: boolean;
  shopId: string | null;
  productId: string;
  productName: string;
  quantity: number;
  deliveryOption: string;
  timestamp: Timestamp;

  // Gathering phase tracking
  gatheringStatus?: "pending" | "assigned" | "gathered" | "at_warehouse" | "failed";
  gatheredBy?: string;
  gatheredByName?: string;
  gatheredAt?: Timestamp;
  arrivedAt?: Timestamp; // When item arrived at warehouse

  // Failure tracking for gathering
  failureReason?: string;
  failureNotes?: string;
  failedAt?: Timestamp;

  // Seller location for gathering routes
  sellerAddress?: {
    addressLine1: string;
    location?: { lat: number; lng: number };
  };
  sellerContactNo?: string | null;
}

// Order-level tracking for distribution phase
export interface OrderHeader {
  id: string;
  buyerId: string;
  buyerName: string;
  address?: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    phoneNumber: string;
  };
  pickupPoint?: {
    pickupPointId: string;
    pickupPointName: string;
    pickupPointAddress: string;
    pickupPointPhone?: string | null;
    pickupPointHours?: string | null;
    pickupPointContactPerson?: string | null;
    pickupPointNotes?: string | null;
    pickupPointLocation?: {
      latitude: number;
      longitude: number;
    } | null;
  };
  deliveryOption: string;
  timestamp: Timestamp;

  // Distribution phase tracking (only after all items gathered)
  distributionStatus?:
    | "pending"
    | "ready"
    | "assigned"
    | "distributed"
    | "delivered"
    | "failed";
  allItemsGathered?: boolean; // Auto-set when all items have arrivedAt
  distributedBy?: string;
  distributedByName?: string;
  distributedAt?: Timestamp;
  deliveredAt?: Timestamp;

  // Failure tracking for distribution
  failureReason?: string;
  failureNotes?: string;
  failedAt?: Timestamp;
}

export interface CombinedOrder {
  orderHeader: OrderHeader;
  items: OrderItem[];
}

// For grouping items by seller in gathering phase
export interface SellerGroup {
  sellerId: string;
  sellerName: string;
  isShopProduct: boolean;
  items: OrderItem[];
  totalItems: number;
  sellerAddress?: {
    addressLine1: string;
  };
  sellerContactNo?: string | null;
}

export interface CargoUser {
  id: string;
  displayName: string;
  email: string;
}

export interface GatheringFilters {
  gatheringStatus: string;
  deliveryOption: string;
  startDate: string;
  endDate: string;
  searchTerm: string;
}

export interface DistributionFilters {
  distributionStatus: string;
  deliveryOption: string;
  startDate: string;
  endDate: string;
  searchTerm: string;
}