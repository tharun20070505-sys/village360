import { Router } from 'express';
import { cache } from '../utils/cache.js';
import { dbBreaker } from '../utils/circuitBreaker.js';
import { Village, Ward, records } from '../models/index.js';

export const discoveryRoutes = Router();

// Full survey instruments metadata registry
const SURVEY_CATALOG = [
  {
    id: 'households',
    name: 'Household Survey',
    category: 'Demographics & Living Standards',
    description: 'Document living conditions, family size, housing type, sanitation, electricity, water access, and government welfare scheme coverage.',
    path: '/surveys/households/new',
    viewPath: '/records/households',
    icon: 'House',
    color: 'sage',
    targetKey: 'households',
    defaultTarget: 100,
    fieldCount: 18,
    consentRequired: true,
    photoSupported: false
  },
  {
    id: 'problems',
    name: 'Village Problems & Grievances',
    category: 'Civic Infrastructure & Public Health',
    description: 'Report acute infrastructure breakdowns, drinking water shortages, road damage, sewage overflow, and community grievances for verification.',
    path: '/surveys/problems/new',
    viewPath: '/records/problems',
    icon: 'Flag',
    color: 'clay',
    targetKey: 'problems',
    defaultTarget: 20,
    fieldCount: 8,
    consentRequired: false,
    photoSupported: true
  },
  {
    id: 'infrastructure',
    name: 'Infrastructure Observations',
    category: 'Public Facilities & Services',
    description: 'Assess physical condition, usability, and accessibility of schools, anganwadis, primary health centres, fair price shops, and roads.',
    path: '/surveys/infrastructure/new',
    viewPath: '/records/infrastructure',
    icon: 'Building2',
    color: 'blue',
    targetKey: 'infrastructure',
    defaultTarget: 25,
    fieldCount: 14,
    consentRequired: false,
    photoSupported: true
  },
  {
    id: 'farmers',
    name: 'Farmer Survey',
    category: 'Agriculture & Livelihood',
    description: 'Record cultivated crops, acreage, irrigation sources, seasonal challenges, fertilizer availability, and agricultural support needs.',
    path: '/surveys/farmers/new',
    viewPath: '/records/farmers',
    icon: 'Tractor',
    color: 'wheat',
    targetKey: 'farmers',
    defaultTarget: 20,
    fieldCount: 12,
    consentRequired: true,
    photoSupported: false
  },
  {
    id: 'shgs',
    name: 'Self-Help Groups (SHGs)',
    category: 'Women Empowerment & Microenterprise',
    description: 'Understand group membership, microcredit access, economic activities, skill development training, and market linkage requirements.',
    path: '/surveys/shgs/new',
    viewPath: '/records/shgs',
    icon: 'UsersRound',
    color: 'sage',
    targetKey: 'shgs',
    defaultTarget: 6,
    fieldCount: 10,
    consentRequired: true,
    photoSupported: false
  },
  {
    id: 'consultations',
    name: 'Panchayat Consultations',
    category: 'Local Governance & Planning',
    description: 'Engage with Panchayat Presidents, ward members, and village elders to capture grassroots development plans and priority interventions.',
    path: '/surveys/consultations/new',
    viewPath: '/records/consultations',
    icon: 'MapPinned',
    color: 'clay',
    targetKey: 'consultations',
    defaultTarget: 3,
    fieldCount: 11,
    consentRequired: false,
    photoSupported: false
  },
  {
    id: 'students',
    name: 'Student Participation',
    category: 'Academic Fieldwork & Volunteering',
    description: 'Track college student teams, hours volunteered, surveys completed, and participatory learning milestones in rural development.',
    path: '/surveys/students/new',
    viewPath: '/records/students',
    icon: 'GraduationCap',
    color: 'blue',
    targetKey: 'students',
    defaultTarget: 25,
    fieldCount: 9,
    consentRequired: false,
    photoSupported: false
  }
];

// GET /api/discovery - Discovery catalog with counts and search
discoveryRoutes.get('/discovery', async (req, res) => {
  const { q, category } = req.query;
  const cacheKey = `discovery:${q || ''}:${category || ''}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  // Use circuit breaker to query live database counts safely
  const liveStats = await dbBreaker.execute(
    async () => {
      const [totalVillages, totalWards, ...counts] = await Promise.all([
        Village.countDocuments(),
        Ward.countDocuments(),
        ...Object.values(records).map(model => model.countDocuments())
      ]);

      const recordCountMap = {};
      Object.keys(records).forEach((kind, i) => {
        recordCountMap[kind] = counts[i];
      });

      return { totalVillages, totalWards, recordCountMap };
    },
    () => ({
      totalVillages: 235,
      totalWards: 2041,
      recordCountMap: {}
    })
  );

  let instruments = SURVEY_CATALOG.map(item => ({
    ...item,
    submittedRecords: liveStats.recordCountMap[item.id] ?? 0
  }));

  // Filter by query keyword if provided
  if (q && typeof q === 'string') {
    const term = q.toLowerCase().trim();
    instruments = instruments.filter(item =>
      item.name.toLowerCase().includes(term) ||
      item.description.toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term)
    );
  }

  // Filter by category if provided
  if (category && typeof category === 'string') {
    instruments = instruments.filter(item =>
      item.category.toLowerCase() === category.toLowerCase()
    );
  }

  const result = {
    district: 'Coimbatore',
    coverage: {
      villages: liveStats.totalVillages,
      wards: liveStats.totalWards
    },
    totalModules: instruments.length,
    modules: instruments,
    categories: [...new Set(SURVEY_CATALOG.map(i => i.category))],
    cachedAt: new Date().toISOString()
  };

  cache.set(cacheKey, result, 60, 'discovery');
  res.set('X-Cache', 'MISS');
  res.json(result);
});

// Alias for survey discovery
discoveryRoutes.get('/surveys/discover', (req, res) => res.redirect('/api/discovery'));
