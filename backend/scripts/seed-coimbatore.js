import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connect } from '../src/config/env.js';
import { Village, Ward, User, targetDefaults } from '../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../data/coimbatore.json');

async function seed() {
  console.log('Connecting to database...');
  await connect();

  const admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    throw new Error('Admin user not found. Please ensure an admin account exists before seeding.');
  }
  console.log(`Using admin: ${admin.email} (${admin._id})`);

  // Read official LGD Coimbatore dataset
  console.log(`Reading dataset from ${DATA_FILE}...`);
  const rawData = await fs.readFile(DATA_FILE, 'utf-8');
  const coimbatoreData = JSON.parse(rawData);
  const panchayats = coimbatoreData.panchayats;

  console.log(`Found ${panchayats.length} Village Panchayats across Coimbatore district.`);

  // Clean up legacy test villages from initial mock seed (names containing "Village Panchayat (* Block)")
  const legacyTestVillages = await Village.find({ name: /Village Panchayat \(.* Block\)$/ });
  if (legacyTestVillages.length > 0) {
    const legacyIds = legacyTestVillages.map(v => v._id);
    await Ward.deleteMany({ village: { $in: legacyIds } });
    await Village.deleteMany({ _id: { $in: legacyIds } });
    console.log(`Cleaned up ${legacyTestVillages.length} legacy mock villages and their test wards.`);
  }

  const unionStats = {};
  let totalVillagesCreated = 0;
  let totalVillagesExisting = 0;
  let totalWardsCreated = 0;

  for (const p of panchayats) {
    const villageName = `${p.panchayat} (${p.union})`;
    const block = p.union;
    unionStats[block] = unionStats[block] || { villages: 0, wards: 0 };
    unionStats[block].villages++;

    let villageDoc = await Village.findOne({ name: villageName });
    if (!villageDoc) {
      const [created] = await Village.create([{
        name: villageName,
        targets: {
          ...targetDefaults,
          households: 100,
          infrastructure: 25,
          farmers: 20,
          shgs: 6,
          consultations: 3,
          students: 25
        },
        createdBy: admin._id
      }]);
      villageDoc = created;
      totalVillagesCreated++;
    } else {
      totalVillagesExisting++;
    }

    // Determine wards for this panchayat
    const wardsToCreate = [];
    if (Array.isArray(p.wards) && p.wards.length > 0) {
      for (const w of p.wards) {
        const wardName = w.tamil ? `${w.name} (${w.tamil})` : w.name;
        wardsToCreate.push(wardName);
      }
    } else {
      // Fallback for 0-ward panchayats to allow survey creation
      wardsToCreate.push('Ward 1 (General)');
    }

    unionStats[block].wards += wardsToCreate.length;

    // Fetch existing wards for this village to avoid duplicates
    const existingWards = await Ward.find({ village: villageDoc._id }).select('name').lean();
    const existingWardNames = new Set(existingWards.map(w => w.name));

    const newWards = wardsToCreate
      .filter(wName => !existingWardNames.has(wName))
      .map(wName => ({
        name: wName,
        village: villageDoc._id,
        createdBy: admin._id
      }));

    if (newWards.length > 0) {
      await Ward.create(newWards);
      totalWardsCreated += newWards.length;
    }
  }

  console.log('\n=============================================');
  console.log('COIMBATORE DISTRICT SURVEY DATA SEEDED');
  console.log('=============================================');
  console.log(`- New Villages Created: ${totalVillagesCreated}`);
  console.log(`- Existing Villages: ${totalVillagesExisting}`);
  console.log(`- Total Official Villages: ${panchayats.length}`);
  console.log(`- Total New Wards Created: ${totalWardsCreated}`);

  const totalInDbVillages = await Village.countDocuments();
  const totalInDbWards = await Ward.countDocuments();
  console.log(`\nDatabase Totals:`);
  console.log(`- Total Villages: ${totalInDbVillages}`);
  console.log(`- Total Wards: ${totalInDbWards}`);

  console.log('\nBreakdown by Union / Block:');
  console.table(Object.entries(unionStats).map(([union, data]) => ({
    'Union / Block': union,
    'Village Panchayats': data.villages,
    'Official Wards': data.wards
  })));

  console.log('Seeding completed successfully!');
}

seed()
  .catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
