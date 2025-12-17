"use client";

// Lightweight shimmer/skeleton components for shipment tabs
// Prevents content flash during tab switches and data loading

// Base shimmer animation class - uses CSS animation for performance
const shimmerClass = "animate-pulse bg-gray-200 rounded";

// Reusable shimmer box component
function ShimmerBox({ className = "" }: { className?: string }) {
  return <div className={`${shimmerClass} ${className}`} />;
}

// Seller group shimmer for GatheringTab
function SellerGroupShimmer() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Seller Header */}
      <div className="bg-gray-50 p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShimmerBox className="w-4 h-4" />
            <ShimmerBox className="w-5 h-5 rounded-full" />
            <div>
              <ShimmerBox className="w-32 h-4 mb-1" />
              <ShimmerBox className="w-48 h-3" />
            </div>
          </div>
          <ShimmerBox className="w-20 h-4" />
        </div>
      </div>
      {/* Items */}
      <div className="divide-y divide-gray-200">
        {[1, 2].map((i) => (
          <div key={i} className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <ShimmerBox className="w-4 h-4" />
                <ShimmerBox className="w-4 h-4" />
                <div className="flex-1">
                  <ShimmerBox className="w-3/4 h-4 mb-1" />
                  <ShimmerBox className="w-1/2 h-3" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ShimmerBox className="w-8 h-4" />
                <ShimmerBox className="w-16 h-6 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Order card shimmer for DistributionTab
function OrderCardShimmer() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Order Header */}
      <div className="bg-gray-50 p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShimmerBox className="w-4 h-4" />
            <div>
              <ShimmerBox className="w-28 h-4 mb-1" />
              <ShimmerBox className="w-40 h-3" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ShimmerBox className="w-16 h-4" />
            <ShimmerBox className="w-20 h-6 rounded-full" />
          </div>
        </div>
      </div>
      {/* Items */}
      <div className="divide-y divide-gray-200">
        {[1, 2].map((i) => (
          <div key={i} className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <ShimmerBox className="w-4 h-4" />
                <div className="flex-1">
                  <ShimmerBox className="w-2/3 h-4 mb-1" />
                  <ShimmerBox className="w-1/3 h-3" />
                </div>
              </div>
              <ShimmerBox className="w-8 h-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Table row shimmer for DeliveredTab
function TableRowShimmer() {
  return (
    <tr>
      <td className="px-3 py-2">
        <ShimmerBox className="w-16 h-5 rounded-full" />
      </td>
      <td className="px-3 py-2">
        <ShimmerBox className="w-20 h-4" />
      </td>
      <td className="px-3 py-2">
        <ShimmerBox className="w-24 h-4" />
      </td>
      <td className="px-3 py-2">
        <ShimmerBox className="w-40 h-4" />
      </td>
      <td className="px-3 py-2">
        <ShimmerBox className="w-32 h-4" />
      </td>
      <td className="px-3 py-2">
        <ShimmerBox className="w-24 h-4" />
      </td>
      <td className="px-3 py-2">
        <ShimmerBox className="w-20 h-4" />
      </td>
      <td className="px-3 py-2">
        <ShimmerBox className="w-28 h-4" />
      </td>
      <td className="px-3 py-2">
        <ShimmerBox className="w-16 h-4" />
      </td>
    </tr>
  );
}

// Gathering Tab Shimmer
export function GatheringTabShimmer() {
  return (
    <div className="space-y-4">
      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-4">
        {/* LEFT: Unassigned */}
        <div className="space-y-3">
          <ShimmerBox className="w-48 h-6 ml-1" />
          {[1, 2, 3].map((i) => (
            <SellerGroupShimmer key={i} />
          ))}
        </div>
        {/* RIGHT: Assigned */}
        <div className="space-y-3">
          <ShimmerBox className="w-44 h-6 ml-1" />
          {[1, 2].map((i) => (
            <SellerGroupShimmer key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Distribution Tab Shimmer
export function DistributionTabShimmer() {
  return (
    <div className="space-y-4">
      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-4">
        {/* LEFT: Unassigned */}
        <div className="space-y-3">
          <ShimmerBox className="w-48 h-6 ml-1" />
          {[1, 2, 3].map((i) => (
            <OrderCardShimmer key={i} />
          ))}
        </div>
        {/* RIGHT: Assigned */}
        <div className="space-y-3">
          <ShimmerBox className="w-44 h-6 ml-1" />
          {[1, 2].map((i) => (
            <OrderCardShimmer key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Delivered Tab Shimmer
export function DeliveredTabShimmer() {
  return (
    <div className="space-y-4">
      {/* Stats Cards Shimmer */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <ShimmerBox className="w-20 h-3 mb-2" />
                <ShimmerBox className="w-12 h-7" />
              </div>
              <ShimmerBox className="w-12 h-12 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Date Filter Shimmer */}
      <div className="flex items-center gap-2">
        <ShimmerBox className="w-24 h-4" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <ShimmerBox key={i} className="w-16 h-8 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Table Shimmer */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Durum", "Sipariş No", "Alıcı", "Ürünler", "Adres", "Telefon", "Teslim Eden", "Teslim Tarihi", "Süre"].map((header) => (
                  <th key={header} className="px-3 py-3 text-left">
                    <ShimmerBox className="w-16 h-3" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <TableRowShimmer key={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
