export type WarehouseStock = {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  city: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
};

export type ProductSummary = {
  id: string;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  warehouses: WarehouseStock[];
};

export type ReservationView = {
  id: string;
  status: "pending" | "confirmed" | "released";
  quantity: number;
  expiresAt: string;
  confirmedAt?: string | null;
  releasedAt?: string | null;
  product: {
    id: string;
    sku: string;
    name: string;
    priceCents: number;
    imageUrl: string;
  };
  warehouse: {
    id: string;
    code: string;
    name: string;
    city: string;
  };
};
