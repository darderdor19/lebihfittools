const localDb = require('./local_food_db.json');

function searchLocalDb(query) {
  const cleanQuery = query.toLowerCase().trim();
  
  // Try exact match
  if (localDb[cleanQuery]) {
    return [localDb[cleanQuery]];
  }

  // Try partial word intersection
  const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 1);
  if (queryWords.length === 0) return [];

  const matches = [];
  for (const key in localDb) {
    const keyWords = key.split(/\s+/);
    // Check if ALL words in the query match at least one word in the database key
    const isMatch = queryWords.every(qw => 
      keyWords.some(kw => kw.includes(qw) || qw.includes(kw))
    );
    if (isMatch) {
      matches.push(localDb[key]);
    }
  }
  return matches;
}

async function searchOpenFoodFacts(query) {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=2`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'LebihFitTools/1.0 (https://lebihfittools.vercel.app)' }
    });
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data.products || data.products.length === 0) return [];
    
    return data.products.map(p => {
      const nuts = p.nutriments || {};
      // Open Food Facts returns sodium in grams. Kemenkes/USDA/LebihFit uses mg.
      const sodiumG = parseFloat(nuts['sodium_100g'] || nuts['sodium'] || 0);
      
      return {
        name: `${p.product_name || 'Produk Kemasan'} (OpenFoodFacts)`,
        cal: parseFloat(nuts['energy-kcal_100g'] || 0),
        protein: parseFloat(nuts['proteins_100g'] || 0),
        carbs: parseFloat(nuts['carbohydrates_100g'] || 0),
        fat: parseFloat(nuts['fat_100g'] || 0),
        fiber: parseFloat(nuts['fiber_100g'] || 0),
        sugar: parseFloat(nuts['sugars_100g'] || 0),
        sodium: Math.round(sodiumG * 1000), // Convert g to mg
        calcium: parseFloat(nuts['calcium_100g'] || 0) * 1000,
        iron: parseFloat(nuts['iron_100g'] || 0) * 1000,
        vitC: parseFloat(nuts['vitamin-c_100g'] || 0) * 1000,
        vitD: parseFloat(nuts['vitamin-d_100g'] || 0) * 1000000, // convert g to mcg
        zinc: parseFloat(nuts['zinc_100g'] || 0) * 1000
      };
    });
  } catch (err) {
    console.error('[OFF API] Error searching:', err);
    return [];
  }
}

async function searchFoodDatabase(query) {
  if (!query || typeof query !== 'string') return [];
  
  // 1. Search locally in TKPI
  const localMatches = searchLocalDb(query);
  if (localMatches.length > 0) {
    return localMatches;
  }
  
  // 2. Search globally in Open Food Facts
  const offMatches = await searchOpenFoodFacts(query);
  if (offMatches.length > 0) {
    return offMatches;
  }
  
  return [];
}

module.exports = {
  searchFoodDatabase,
  searchLocalDb,
  searchOpenFoodFacts
};


