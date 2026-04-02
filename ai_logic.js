/* KachraDarpan - Advanced AI Logic (TensorFlow.js) */

let model;

// Load MobileNet Model
async function loadAIModel() {
    console.log("🧬 System: Initializing DeepMind Waste Classification Model...");
    try {
        model = await mobilenet.load();
        console.log("✅ System: Model online. Ready for scan.");
    } catch (e) {
        console.error("❌ System: Model failed to load.", e);
    }
}

// Comprehensive Waste Category Mapping
const WASTE_MAP = {
    'bottle': { type: 'Plastic Waste 🥤', group: 'Recyclable' },
    'plastic': { type: 'Plastic Waste 🥤', group: 'Recyclable' },
    'bag': { type: 'Plastic/Synthetic 🛍️', group: 'General' },
    'packet': { type: 'Multi-layer Packaging 📦', group: 'Mixed' },
    'wrapper': { type: 'Thin Film Plastic 🍬', group: 'Mixed' },
    'can': { type: 'Metal Recyclables 🥫', group: 'Recyclable' },
    'tin': { type: 'Metal Waste 🥫', group: 'Recyclable' },
    'nail': { type: 'Sharp Metal Waste 📍', group: 'Hazardous' },
    'battery': { type: 'Electronic Waste 🔋', group: 'Hazardous' },
    'phone': { type: 'E-Waste / Circuitry 📱', group: 'Hazardous' },
    'wire': { type: 'E-Waste / Copper 🔌', group: 'Hazardous' },
    'apple': { type: 'Organic / Bio-degradable 🍎', group: 'Organic' },
    'banana': { type: 'Organic / Bio-degradable 🍌', group: 'Organic' },
    'orange': { type: 'Organic / Bio-degradable 🍊', group: 'Organic' },
    'vegetable': { type: 'Kitchen Waste 🥦', group: 'Organic' },
    'bread': { type: 'Food Waste 🍞', group: 'Organic' },
    'paper': { type: 'Paper Waste 📄', group: 'Recyclable' },
    'cardboard': { type: 'Paper/Cardboard 📦', group: 'Recyclable' },
    'trash': { type: 'Mixed General Waste 🗑️', group: 'General' },
    'garbage': { type: 'Mixed General Waste 🗑️', group: 'General' },
    'syringe': { type: 'Bio-Medical Waste 💉', group: 'Hazardous' },
    'pill': { type: 'Medical Waste 💊', group: 'Hazardous' },
    'glass': { type: 'Glass Fragment 🍷', group: 'Recyclable' },
    'cup': { type: 'Disposable Cup ☕', group: 'Mixed' },
    'mask': { type: 'Sanitary Waste 😷', group: 'Hazardous' }
};

function mapToWasteType(predictions) {
    // Look for the most relevant match across top predictions
    for (let p of predictions) {
        const className = p.className.toLowerCase();
        for (let key in WASTE_MAP) {
            if (className.includes(key)) {
                const match = WASTE_MAP[key];
                return { 
                    type: match.type, 
                    group: match.group,
                    confidence: Math.round(p.probability * 100) + '%',
                    isHazardous: match.group === 'Hazardous'
                };
            }
        }
    }
    
    // Default fallback
    return { 
        type: 'General Mixed Waste 🗑️', 
        group: 'General',
        confidence: Math.round(predictions[0].probability * 100) + '%',
        isHazardous: false
    };
}

// Analyze Image
async function analyzeWaste(imgElement) {
    if (!model) await loadAIModel();
    
    // Perform classification
    const predictions = await model.classify(imgElement);
    console.log("🔍 AI Analysis Stream:", predictions);

    const result = mapToWasteType(predictions);
    
    // Add special flagging for hazardous items
    if (result.isHazardous) {
        result.type = `⚠️ CRITICAL: ${result.type}`;
    }

    return result;
}

// Initialize on load
loadAIModel();
