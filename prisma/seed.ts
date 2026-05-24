import { PrismaClient } from "@prisma/client";

if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

const products = [
  {
    sku: "ALLO-TEE-001",
    name: "Everyday Cotton Tee",
    description: "Soft midweight tee for daily retail drops.",
    priceCents: 189900,
    imageUrl:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80"
  },
  {
    sku: "ALLO-BAG-014",
    name: "City Sling Bag",
    description: "Compact crossbody with quick-moving marketplace demand.",
    priceCents: 349900,
    imageUrl:
      "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80"
  },
  {
    sku: "ALLO-SHOE-078",
    name: "Transit Runner",
    description: "Limited-size sneaker that often sells through in minutes.",
    priceCents: 799900,
    imageUrl:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80"
  }
];

const warehouses = [
  { code: "BLR", name: "Bengaluru FC", city: "Bengaluru" },
  { code: "MUM", name: "Mumbai West Hub", city: "Mumbai" },
  { code: "DEL", name: "Delhi NCR Hub", city: "Delhi" }
];

async function main() {
  await prisma.idempotencyRecord.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  const createdWarehouses = await Promise.all(
    warehouses.map((warehouse) => prisma.warehouse.create({ data: warehouse }))
  );

  for (const [productIndex, product] of products.entries()) {
    const createdProduct = await prisma.product.create({ data: product });

    await Promise.all(
      createdWarehouses.map((warehouse, warehouseIndex) =>
        prisma.stockLevel.create({
          data: {
            productId: createdProduct.id,
            warehouseId: warehouse.id,
            totalUnits: [8, 4, 1][(productIndex + warehouseIndex) % 3],
            reservedUnits: 0
          }
        })
      )
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
