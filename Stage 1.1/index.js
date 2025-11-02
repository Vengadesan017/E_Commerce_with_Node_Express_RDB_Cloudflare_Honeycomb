import fs from "fs/promises";
import readline from "readline";

const filePath = "./data/products.json";

// --- Helper: Ensure JSON file exists ---
async function ensureFile() {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir("./data", { recursive: true });
    await fs.writeFile(filePath, "[]");
  }
}

// --- CRUD Functions ---

async function readProducts() {
  const data = await fs.readFile(filePath, "utf8");
  return JSON.parse(data);
}

async function addProduct(newProduct) {
  const products = await readProducts();
  newProduct.id = products.length ? products[products.length - 1].id + 1 : 1;
  products.push(newProduct);
  await fs.writeFile(filePath, JSON.stringify(products, null, 2));
  console.log("Product added:", newProduct);
}

async function updateProduct(id, updatedData) {
  const products = await readProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index !== -1) {
    products[index] = { ...products[index], ...updatedData };
    await fs.writeFile(filePath, JSON.stringify(products, null, 2));
    console.log("Product updated:", products[index]);
  } else {
    console.log("Product not found!");
  }
}

async function softDeleteProduct(id) {
  const products = await readProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index !== -1) {
    products[index].deleted = true;
    await fs.writeFile(filePath, JSON.stringify(products, null, 2));
    console.log("Product soft deleted:", products[index]);
  } else {
    console.log("Product not found!");
  }
}

async function deleteProduct(id) {
  const products = await readProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index !== -1) {
    const deletedProduct = products.splice(index, 1);
    await fs.writeFile(filePath, JSON.stringify(products, null, 2));
    console.log("Product permanently deleted:", deletedProduct[0]);
  } else {
    console.log("Product not found!");
  }
}

async function readActiveProducts() {
  const products = await readProducts();
  return products.filter((p) => !p.deleted);
}

// --- CLI Interface ---

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await ensureFile();

  while (true) {
    console.log("\n\n\n======================================================");
    console.log("===   FIle Based E commerce with CURD operation    ===");
    console.log("======================================================");
    console.log("1. Add Product");
    console.log("2. View All Products");
    console.log("3. View Active Products");
    console.log("4. Update Product");
    console.log("5. Soft Delete Product");
    console.log("6. Hard Delete Product");
    console.log("7. Exit");

    const choice = await ask("\nChoose an option: ");

    switch (choice) {
      case "1": {
        const name = await ask("Enter product name: ");
        const price = parseFloat(await ask("Enter product price: "));
        const stock = parseInt(await ask("Enter product stock: "));
        await addProduct({ name, price, stock });
        break;
      }

      case "2": {
        const all = await readProducts();
        console.log("\nAll Products:", all);
        break;
      }

      case "3": {
        const active = await readActiveProducts();
        console.log("\nActive Products:", active);
        break;
      }

      case "4": {
        const id = parseInt(await ask("Enter product ID to update: "));
        const price = parseFloat(await ask("New price (or press Enter to skip): ")) || undefined;
        const stock = parseInt(await ask("New stock (or press Enter to skip): ")) || undefined;
        const updates = {};
        if (price !== undefined) updates.price = price;
        if (stock !== undefined) updates.stock = stock;
        await updateProduct(id, updates);
        break;
      }

      case "5": {
        const id = parseInt(await ask("Enter product ID to soft delete: "));
        await softDeleteProduct(id);
        break;
      }

      case "6": {
        const id = parseInt(await ask("Enter product ID to permanently delete: "));
        await deleteProduct(id);
        break;
      }

      case "7":
        console.log(" Exiting...");
        rl.close();
        process.exit(0);

      default:
        console.log("Invalid option, please try again!");
    }
    await wait(3000);
  }
}

main();
