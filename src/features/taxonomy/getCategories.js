import { prisma } from "../../lib/prisma";

export async function getCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { position: "asc" },
    include: {
      types: {
        where: { isActive: true },
        orderBy: { position: "asc" },
      },
    },
  });
}