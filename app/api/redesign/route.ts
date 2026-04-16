import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { image, roomType, designStyle, options, additionalPrompt, referenceImage } = await request.json();

    if (!image) {
      return NextResponse.json({ error: 'Görsel gereklidir' }, { status: 400 });
    }

    const FAL_KEY = process.env.FAL_KEY;
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!FAL_KEY) {
      return NextResponse.json({ error: 'FAL API anahtarı yapılandırılmamış' }, { status: 500 });
    }

    console.log("=== LUXORA AI REDESIGN ===");
    console.log("Room:", roomType, "Style:", designStyle);
    console.log("Options:", JSON.stringify(options));
    console.log("Additional:", additionalPrompt || "(none)");

    // ============================================
    // STEP 1: Claude ile oda analizi (opsiyonel)
    // ============================================
    let roomAnalysis = "";

    if (ANTHROPIC_API_KEY) {
      try {
        console.log("Claude ile oda analiz ediliyor...");
        roomAnalysis = await analyzeRoomWithClaude(image, ANTHROPIC_API_KEY);
        console.log("Oda analizi:", roomAnalysis.substring(0, 200) + "...");
      } catch (err) {
        console.error("Claude analiz hatası:", err);
      }
    }

    // ============================================
    // STEP 2: Referans görsel CDN'e yükle
    // ============================================
    let refUrl: string | null = null;
    if (referenceImage && referenceImage.startsWith('data:')) {
      try {
        console.log("Referans görsel CDN'e yükleniyor...");
        refUrl = await uploadToFalCDN(referenceImage, FAL_KEY);
        console.log("✅ Referans CDN URL:", refUrl.substring(0, 80) + "...");
      } catch (err) {
        console.warn("Referans yükleme hatası:", err);
      }
    } else if (referenceImage) {
      refUrl = referenceImage;
    }

    // ============================================
    // STEP 3: Interior design prompt oluştur
    // ============================================
    const designPrompt = buildDesignPrompt(roomType, designStyle, options, additionalPrompt, roomAnalysis, refUrl);
    console.log("=== FINAL PROMPT ===");
    console.log(designPrompt);
    console.log("=== END PROMPT ===");

    // ============================================
    // STEP 3: Görseli Fal CDN'e yükle (base64 → URL)
    // ============================================
    let imageUrl = image;
    
    if (image.startsWith('data:')) {
      try {
        console.log("Base64 görsel Fal CDN'e yükleniyor...");
        imageUrl = await uploadToFalCDN(image, FAL_KEY);
        console.log("✅ CDN URL:", imageUrl.substring(0, 80) + "...");
      } catch (err) {
        console.warn("⚠️ CDN yükleme başarısız, base64 ile devam ediliyor:", err);
        imageUrl = image; // fallback to base64
      }
    }

    // ============================================
    // STEP 4: Fal AI ile görsel üret
    // ============================================
    let resultImageUrl: string | null = null;

    // Spesifik düzenleme mi tam tasarım mı?
    const isSpecificEdit = additionalPrompt && additionalPrompt.trim().length > 0;

    // Model 1: Nano Banana Pro (en iyi sonuç — Gemini 3 Pro Image)
    try {
      console.log("Model 1: Nano Banana Pro Edit deneniyor...");
      console.log("Mode:", isSpecificEdit ? "SPECIFIC EDIT" : "FULL REDESIGN");
      const imageUrls = refUrl ? [imageUrl, refUrl] : [imageUrl];
      resultImageUrl = await generateWithNanoBananaPro(imageUrls, designPrompt, FAL_KEY);
      console.log("✅ Nano Banana Pro başarılı!");
    } catch (err) {
      console.error("❌ Nano Banana Pro hatası:", err);
    }

    // Model 2: Nano Banana 2 (hızlı fallback — Gemini 3.1 Flash)
    if (!resultImageUrl) {
      try {
        console.log("Model 2: Nano Banana 2 Edit deneniyor...");
        const imageUrls2 = refUrl ? [imageUrl, refUrl] : [imageUrl];
        resultImageUrl = await generateWithNanoBanana2(imageUrls2, designPrompt, FAL_KEY);
        console.log("✅ Nano Banana 2 başarılı!");
      } catch (err) {
        console.error("❌ Nano Banana 2 hatası:", err);
      }
    }

    // Model 3: FLUX 2 Pro Edit (fallback)
    if (!resultImageUrl) {
      try {
        const strength = isSpecificEdit ? 0.35 : (options.keepLayout ? 0.70 : 0.90);
        console.log("Model 3: FLUX 2 Pro Edit deneniyor... (strength:", strength, ")");
        resultImageUrl = await generateWithFlux2ProEdit(imageUrl, designPrompt, FAL_KEY, strength);
        console.log("✅ FLUX 2 Pro Edit başarılı!");
      } catch (err) {
        console.error("❌ FLUX 2 Pro Edit hatası:", err);
      }
    }

    // Model 4: FLUX Dev image-to-image (son çare)
    if (!resultImageUrl) {
      try {
        const strength = isSpecificEdit ? 0.35 : (options.keepLayout ? 0.70 : 0.90);
        console.log("Model 4: FLUX Dev deneniyor... (strength:", strength, ")");
        resultImageUrl = await generateWithFluxDev(imageUrl, designPrompt, strength, FAL_KEY);
        console.log("✅ FLUX Dev başarılı!");
      } catch (err) {
        console.error("❌ FLUX Dev hatası:", err);
        throw new Error("Hiçbir model görsel üretemedi. Lütfen tekrar deneyin.");
      }
    }

    console.log("=== REDESIGN TAMAMLANDI ===");

    return NextResponse.json({
      success: true,
      resultImage: resultImageUrl,
    });

  } catch (error) {
    console.error('Redesign error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Tasarım oluşturulamadı'
    }, { status: 500 });
  }
}

// ============================================
// CLAUDE ODA ANALİZİ
// ============================================
async function analyzeRoomWithClaude(imageData: string, apiKey: string): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({ apiKey });

  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
  const mediaType = imageData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64Data,
            },
          },
          {
            type: 'text',
            text: `You are an expert architectural surveyor performing a DETAILED structural analysis of this room photo for an interior redesign project where the room layout MUST be preserved exactly.

Provide an extremely detailed spatial map:

1. ROOM SHAPE: Exact shape (rectangular, L-shaped, narrow corridor, etc.), approximate dimensions ratio (width:depth:height)
2. CAMERA: Exact camera angle, perspective (looking from which direction), focal length estimate
3. LEFT WALL: Describe EVERY element from left to right — any built-in closets, recessed areas, shelving, mirrors, niches, protrusions, pipes, radiators. State exact position (near ceiling, mid-wall, floor level)
4. RIGHT WALL: Same detailed scan — every element, protrusion, recess, built-in feature
5. FAR WALL (facing camera): Doors (position, type), windows, built-in elements
6. CEILING: Shape (flat, coffered, suspended, with recess), lighting fixtures positions, any decorative elements
7. FLOOR: Material, pattern, any level changes or steps
8. BUILT-IN ELEMENTS (CRITICAL): List EVERY permanent architectural feature — built-in wardrobes, closets, wall protrusions, columns, niches, alcoves, fireplace, radiator covers, air vents, electrical panels. For each, state: what it is, which wall it's on, its approximate position (left/center/right, top/middle/bottom)
9. STRUCTURAL OBSTACLES: Any irregular wall shapes, corners, angles, steps, or asymmetrical features

Be EXTREMELY specific about positions. Example: "Left wall has a built-in mirror/wardrobe panel occupying the first 30% of the wall from the entrance. Right wall has a protruding column at 60% creating a 20cm step-out." This analysis will be used to ensure these features are preserved in the redesign.`,
          },
        ],
      },
    ],
  });

  let description = '';
  for (const block of message.content) {
    if (block.type === 'text') {
      description = block.text;
      break;
    }
  }

  return description
    .replace(/^["']|["']$/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// PROMPT BUILDER — İç Mimari Odaklı
// ============================================
function buildDesignPrompt(
  roomType: string,
  designStyle: string,
  options: { changeWalls: boolean; changeFloor: boolean; changeLighting: boolean; keepLayout: boolean },
  additionalPrompt: string,
  roomAnalysis: string,
  referenceUrl?: string | null
): string {

  // ---- ODA TÜRLERİ: her oda için spesifik mobilya listesi ----
  const roomConfig: Record<string, { name: string; furniture: string }> = {
    "salon": {
      name: "luxury living room",
      furniture: "a large designer sofa (3-seater), accent armchairs, a sculptural coffee table, side tables with table lamps, a statement floor lamp, a premium area rug, decorative throw pillows and blankets, a console table with curated objects, large-scale artwork on walls, decorative vases with fresh flowers, coffee table books, curtains or drapes"
    },
    "yatak": {
      name: "luxury master bedroom",
      furniture: "a king-size upholstered bed with premium headboard, matching nightstands with designer table lamps, a bench or ottoman at the foot of the bed, a statement dresser or vanity, an accent chair with reading lamp, luxury bedding (duvet, decorative pillows, throw), a large area rug, artwork above the bed, full-length curtains, decorative accessories"
    },
    "mutfak": {
      name: "luxury kitchen",
      furniture: "premium cabinetry (floor to ceiling), a large kitchen island with designer bar stools, professional-grade appliances (integrated), statement pendant lights over the island, luxury countertops (marble or quartz), a built-in wine cooler, open shelving with curated dishware, fresh herbs or plants, cookbook display, premium fixtures and hardware"
    },
    "banyo": {
      name: "luxury spa bathroom",
      furniture: "a freestanding sculptural bathtub, a double vanity with designer mirrors, premium fixtures (brushed gold or matte black), walk-in rainfall shower, luxury towels on heated rack, a vanity stool or bench, scented candles and premium toiletries, large format wall tiles, statement pendant or chandelier, live plants, decorative storage"
    },
    "calisma": {
      name: "luxury home office",
      furniture: "an executive desk (wood or leather top), a premium ergonomic office chair, floor-to-ceiling built-in bookshelves, a reading lounge chair with ottoman, desk lamp and floor lamp, curated art and objects on shelves, a large area rug, premium curtains, desktop accessories (leather tray, pen holder), plants"
    },
    "hol": {
      name: "luxury entrance hall / foyer",
      furniture: "a statement console table with curated objects, a large designer mirror or artwork, a signature pendant light or chandelier, an elegant bench or accent chair, premium umbrella stand, decorative vases, a runner rug, coat hooks or closet, wall sconces, fresh flower arrangement"
    },
    "yemek": {
      name: "luxury dining room",
      furniture: "a large dining table (seats 6-8) in premium material, designer dining chairs with upholstery, a dramatic chandelier or pendant cluster above the table, a sideboard or buffet with curated display, large-scale artwork, a mirror to amplify space, premium table setting (plates, glasses, candelabra), curtains, plants"
    },
    "bahce": {
      name: "luxury outdoor terrace / garden lounge",
      furniture: "premium outdoor sofas with cushions, outdoor dining set, a fire pit or outdoor fireplace, planters with lush greenery, outdoor lighting (string lights, lanterns), an outdoor rug, a bar cart or outdoor kitchen, sun umbrellas or pergola with draping, decorative pillows, potted trees"
    },
    "yat": {
      name: "luxury yacht interior salon",
      furniture: "built-in L-shaped leather sofa, teak and chrome cocktail table, custom cabinetry with marine hardware, panoramic windows, recessed ceiling lights with dimmers, premium bar area with glassware display, marine-grade flooring, nautical accessories, compact dining area, luxury finishes throughout"
    },
  };

  // ---- TASARIM STİLLERİ ----
  const stylePrompts: Record<string, string> = {
    "sessiz-luks": "Quiet Luxury (Old Money aesthetic). Understated elegance with no visible branding. Loro Piana cashmere throws, Brunello Cucinelli-inspired textures. Tonal neutral palette: cream, taupe, warm stone, soft gray. Ultra-premium natural materials: travertine, raw silk, linen, hand-troweled plaster walls. Bespoke artisan furniture with organic curves. Museum-quality abstract art. Ambient indirect cove lighting. Everything whispers wealth without shouting",
    "italyan": "Italian Luxury Architecture (Milanese Sophistication). Poltrona Frau leather seating, B&B Italia sculptural furniture, Cassina and Minotti pieces. Calacatta Oro marble surfaces, terrazzo accents, Venetian plaster walls in warm earth tones. Arched doorways and niches. Hand-blown Murano glass pendant lights. Mediterranean warmth meets Milanese precision. Rich walnut and brass details",
    "luxury-konsept": "Ultra-Luxury Concept Design. Fendi Casa and Armani Casa furniture pieces. Statement bookmatched marble slabs (onyx, Calacatta). Brushed gold and brass hardware throughout. Swarovski or Baccarat crystal chandeliers. Full-grain leather, silk velvet, cashmere. Dramatic double-height proportions. Floor-to-ceiling windows. Gallery-worthy contemporary art. Everything custom and bespoke",
    "modern": "Modern Minimalist Luxury. Clean architectural lines, deliberate negative space. Molteni&C and Poliform furniture. Monochromatic palette with warm neutrals. Hidden storage, seamless surfaces. Recessed linear LED lighting. Single statement art piece. Premium materials: concrete, glass, matte lacquer. Less is more philosophy executed with the most expensive materials",
    "klasik-luks": "Classic European Luxury. Gilded crown moldings and ceiling medallions. Crystal Baccarat chandeliers. Rich Rubelli and Dedar fabrics (damask, silk, velvet). Hand-carved furniture with gold leaf details. Palatial proportions. Aubusson tapestry rugs. Oil paintings in ornate gold frames. Marble fireplace with gilded mirror above. Versailles meets modern comfort",
    "art-deco": "Art Deco Glamour. Bold geometric patterns, sunburst and chevron motifs. Rich jewel tones: emerald green, sapphire blue, ruby red with gold accents. Mirrored and lacquered surfaces. Velvet upholstery. Chrome and brass details. Glamorous bar area. Exotic materials: shagreen, mother of pearl, marquetry. 1920s Manhattan penthouse atmosphere",
    "japandi": "Japandi Luxury. Japanese wabi-sabi meets Scandinavian lagom. Low platform furniture in light oak. Shoji-screen inspired room dividers. Paper pendant lights. Bonsai and ikebana arrangements. Neutral palette: warm white, sand, charcoal. Tatami texture accents. Ceramic vessels by artisan potters. Indirect ambient lighting. Intentional negative space. Zen tranquility",
    "fransiz": "French Elegance (Parisian Chic). Haussmann-inspired architecture: herringbone oak parquet, ornate plaster moldings, tall windows with juliet balconies. Louis XV/XVI furniture reinterpreted by Christian Liaigre or Roche Bobois. Soft palette: powder blue, blush, ivory, gilt. Antique mirrors, crystal wall sconces. Bouclé and mohair upholstery. Fresh peonies. Effortless sophistication",
    "hollywood": "Hollywood Regency Glamour. Bold maximalism at its finest. High-gloss lacquered walls. Oversized gold-framed mirrors. Deep jewel-toned velvet: emerald, amethyst, sapphire. Faux fur throws, Lucite and brass furniture. Crystal bar cart fully stocked. Palm leaf and chinoiserie motifs. Tufted upholstery. Dramatic lighting with dimmer mood. Red carpet worthy interiors",
    "iskand": "Scandinavian Premium. Light Scandinavian oak throughout. &Tradition, Muuto, HAY, and Fritz Hansen furniture. Hygge atmosphere with warm textiles: Tekla blankets, sheepskin throws. White walls with warm undertones. Functional beauty. Georg Jensen accessories. Pendant lights by Louis Poulsen. Indoor plants: fiddle leaf fig, olive tree. Clean, calm, cozy",
    "contemporary": "Contemporary Luxury. Current design trends executed with premium materials. Fluid organic furniture forms. Mixed textures: polished concrete meets silk, black steel meets cream velvet. Statement sculptural lighting. Curated contemporary art collection. Monochromatic base with one bold accent color. Smart home integration. Floor-to-ceiling glass. Indoor-outdoor flow",
    "neo-klasik": "Neoclassical Luxury. Greek and Roman architectural refinement reimagined. Fluted columns, pediment details, coffered ceilings. Symmetrical furniture layouts. Marble floors with geometric inlays. Sophisticated muted palette: ivory, stone gray, dusty sage, bronze. Sculptural furniture with clean proportions. Fine bronze hardware. Classical bust sculptures. Timeless grandeur updated",
    "tropik-luks": "Tropical Luxury Resort. Aman Resorts and Four Seasons Bali aesthetic. Seamless indoor-outdoor living. Teak and rattan furniture. Lush tropical plants: monstera, palm, bird of paradise. Natural stone and bamboo surfaces. White linen curtains billowing. Infinity pool view. Woven pendant lights. Organic shapes. Neutral base with natural green accents. Barefoot luxury",
    "brutalist": "Brutalist Luxury. Raw board-formed concrete as hero material. Dramatic geometric volumes. Tadao Ando-inspired play of light and shadow. Unexpected luxury juxtapositions: velvet on concrete, gold on raw cement. Monolithic furniture pieces. Gallery-like proportions. Sculptural concrete staircase. Minimal but impactful. Each piece a statement",
    "wabi-sabi": "Wabi-Sabi Philosophy. Beauty in imperfection and transience. Handmade ceramic vessels with irregular glazes. Weathered reclaimed wood surfaces. Raw linen and hemp textiles. Organic asymmetrical forms. Muted earth palette: clay, charcoal, sand, moss. Aged patina on bronze and copper. Ikebana flower arrangements. Filtered natural light. Quiet contemplation. Nothing is perfect, nothing is finished",
  };

  // ---- BUILD PROMPT ----
  const roomInfo = roomConfig[roomType] || { name: "luxury room", furniture: "designer furniture, premium accessories, artwork, lighting, rugs, and decorative objects" };
  
  // Serbest mod: referans görsel veya genel lüks stil
  const isFreeStyle = designStyle === 'serbest';
  const styleDesc = isFreeStyle 
    ? (referenceUrl 
        ? "Match the EXACT design style, color palette, materials, textures, and aesthetic shown in the second reference image. Replicate every visual detail of that style" 
        : "modern luxury interior design with premium furniture and finishes, creative freedom to choose the best aesthetic")
    : (stylePrompts[designStyle] || "modern luxury interior design with premium furniture and finishes");

  // ===== İKİ MOD: SPESİFİK DÜZENLEME vs TAM TASARIM =====
  const hasSpecificEdit = additionalPrompt && additionalPrompt.trim().length > 0;

  let prompt: string;

  if (hasSpecificEdit) {
    // ===== MOD 1: SPESİFİK DÜZENLEME =====
    // Kullanıcı "üniteyi kaldır şömine koy" gibi spesifik istek yaptığında
    // Sadece istenen değişikliği yap, geri kalan HER ŞEYİ koru
    prompt = `Edit this interior photo. Make ONLY the following specific change: ${additionalPrompt}. `;
    prompt += `CRITICAL: Keep EVERYTHING else in the room EXACTLY as it is — same furniture, same walls, same floor, same lighting, same camera angle, same colors, same decorations. `;
    prompt += `Only modify what the instruction specifically asks for. Do NOT redesign or restyle the room. Do NOT change furniture that isn't mentioned. Do NOT change wall colors or floor materials unless specifically asked. `;
    prompt += `The result should look like the same photo with only the requested edit applied. `;

    // Mimari yapıyı koru — spesifik düzenlemede de önemli
    if (roomAnalysis) {
      prompt += `ROOM STRUCTURE (preserve exactly): ${roomAnalysis.substring(0, 500)}. `;
    }

    // Stil bilgisi sadece eklenen mobilya/obje için geçerli
    prompt += `If adding new items, they should match ${styleDesc} aesthetic. `;

    // Seçenek bazlı ek izinler
    if (options.changeWalls) {
      prompt += "You are also allowed to update the wall colors/materials. ";
    }
    if (options.changeFloor) {
      prompt += "You are also allowed to change the flooring. ";
    }
    if (options.changeLighting) {
      prompt += "You are also allowed to change lighting fixtures. ";
    }

    prompt += "Photorealistic quality, maintain the exact same perspective and proportions.";

  } else {
    // ===== MOD 2: TAM TASARIM =====
    // Ek direktif yoksa → odayı seçilen stilde komple tasarla
    prompt = `You are the world's best interior designer. Completely redesign this ${roomInfo.name} in the following style: ${styleDesc}. `;

    // Mobilya yerleştirme
    prompt += `MANDATORY: You must place the following furniture and items in this room: ${roomInfo.furniture}. `;
    prompt += `Every piece must be high-end designer quality. The room must look COMPLETELY FURNISHED — like a professional photoshoot for Architectural Digest. `;
    prompt += `DO NOT leave any area empty. Fill the room with life: books, plants, candles, textures, layers. `;

    // Oda analizi — keepLayout olmasa bile mimari ref olarak kullan
    if (roomAnalysis && !options.keepLayout) {
      prompt += `Room reference: ${roomAnalysis.substring(0, 300)}. Use this as a spatial guide. `;
    }

    // Oda düzenini koru
    if (options.keepLayout) {
      prompt += "CRITICAL LAYOUT PRESERVATION: You MUST keep the EXACT same room architecture from the original photo. This includes: ";
      prompt += "(1) Every wall position, angle, and protrusion must remain identical. ";
      prompt += "(2) Built-in closets, wardrobes, shelving units, and permanent fixtures must stay in their exact positions. ";
      prompt += "(3) Door and window positions, sizes, and shapes must not change. ";
      prompt += "(4) Ceiling shape, height changes, coffers, and recesses must be preserved. ";
      prompt += "(5) Any wall protrusions, columns, niches, or irregular shapes must remain. ";
      prompt += "(6) The camera angle and perspective must be identical to the original. ";
      if (roomAnalysis) {
        prompt += `ORIGINAL ROOM STRUCTURE TO PRESERVE: ${roomAnalysis.substring(0, 600)}. Every architectural element described here MUST appear in the output image in the same position. `;
      }
      prompt += "You may change furniture styles, colors, materials, and add decorative items — but the WALLS, BUILT-INS, and ARCHITECTURAL SHELL must be pixel-accurate to the original. ";
    } else {
      prompt += "LAYOUT: You have complete creative freedom. Redesign the entire space from scratch. ";
    }

    // Duvar değiştir
    if (options.changeWalls) {
      prompt += "WALLS: Transform the walls — apply new paint, wallpaper, wall panels, moldings, or textured plaster. ";
    } else {
      prompt += "WALLS: Keep existing wall color and material. Only add wall art or sconces. ";
    }

    // Zemin değiştir
    if (options.changeFloor) {
      prompt += "FLOORING: Replace with premium material (hardwood, marble, terrazzo, etc.). ";
    } else {
      prompt += "FLOORING: Keep existing floor. Add area rugs on top. ";
    }

    // Aydınlatma değiştir
    if (options.changeLighting) {
      prompt += "LIGHTING: Install signature designer lighting — chandeliers, pendants, floor lamps, recessed lights. ";
    } else {
      prompt += "LIGHTING: Maintain existing lighting. Add table lamps only. ";
    }

    prompt += "Ultra-photorealistic, 8K, professional architectural photography. Golden hour lighting. Magazine cover quality.";
  }

  return prompt;
}

// ============================================
// MODEL 1: NANO BANANA PRO (en iyi kalite)
// ============================================
async function generateWithNanoBananaPro(imageData: string | string[], prompt: string, apiKey: string): Promise<string> {
  const imageUrls = Array.isArray(imageData) ? imageData : [imageData];
  const requestBody = {
    prompt: prompt,
    image_urls: imageUrls,
    num_images: 1,
    aspect_ratio: "16:9",
    output_format: "png",
    resolution: "2K",
  };

  const response = await fetch("https://fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: {
      "Authorization": `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Nano Banana Pro failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.images && data.images.length > 0) {
    return data.images[0].url;
  }
  throw new Error("No images in Nano Banana Pro response");
}

// ============================================
// MODEL 2: NANO BANANA 2 (hızlı fallback)
// ============================================
async function generateWithNanoBanana2(imageData: string | string[], prompt: string, apiKey: string): Promise<string> {
  const imageUrls = Array.isArray(imageData) ? imageData : [imageData];
  const requestBody = {
    prompt: prompt,
    image_urls: imageUrls,
    num_images: 1,
    aspect_ratio: "16:9",
    output_format: "png",
  };

  const response = await fetch("https://fal.run/fal-ai/nano-banana-2/edit", {
    method: "POST",
    headers: {
      "Authorization": `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Nano Banana 2 failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.images && data.images.length > 0) {
    return data.images[0].url;
  }
  throw new Error("No images in Nano Banana 2 response");
}

// ============================================
// MODEL 3: FLUX 2 Pro Edit
// ============================================
async function generateWithFlux2ProEdit(imageData: string, prompt: string, apiKey: string, strength?: number): Promise<string> {
  const requestBody: Record<string, unknown> = {
    prompt: prompt,
    image_urls: [imageData],
  };
  if (strength !== undefined) {
    requestBody.strength = strength;
  }

  const response = await fetch("https://fal.run/fal-ai/flux-2-pro/edit", {
    method: "POST",
    headers: {
      "Authorization": `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FLUX 2 Pro Edit failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.images && data.images.length > 0) {
    return data.images[0].url;
  }
  throw new Error("No images in FLUX 2 Pro response");
}

// ============================================
// MODEL 4: FLUX Dev Image-to-Image (son çare)
// ============================================
async function generateWithFluxDev(imageData: string, prompt: string, strength: number, apiKey: string): Promise<string> {
  const requestBody = {
    prompt: prompt,
    image_url: imageData,
    strength: strength,
    num_inference_steps: 28,
    guidance_scale: 3.5,
    image_size: { width: 1920, height: 1080 },
    num_images: 1,
    enable_safety_checker: false,
    output_format: "png",
  };

  const response = await fetch("https://fal.run/fal-ai/flux/dev/image-to-image", {
    method: "POST",
    headers: {
      "Authorization": `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FLUX Dev failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.images && data.images.length > 0) {
    return data.images[0].url;
  }
  throw new Error("No images in FLUX Dev response");
}

// ============================================
// FAL CDN UPLOAD — Base64 → URL
// ============================================
async function uploadToFalCDN(base64Data: string, apiKey: string): Promise<string> {
  // Base64'ü binary'ye çevir
  const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid base64 image data");
  
  const mimeType = matches[1];
  const base64 = matches[2];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Fal storage'a yükle
  const ext = mimeType.split('/')[1] || 'png';
  const fileName = `luxora_upload_${Date.now()}.${ext}`;

  // İlk olarak upload URL al
  const initResponse = await fetch("https://fal.run/fal-ai/fal-storage/upload/initiate", {
    method: "POST",
    headers: {
      "Authorization": `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_name: fileName,
      content_type: mimeType,
    }),
  });

  if (!initResponse.ok) {
    // Fallback: doğrudan data URL kullan
    console.warn("CDN initiate failed, using data URL fallback");
    return base64Data;
  }

  const { upload_url, file_url } = await initResponse.json();

  // Görseli yükle
  const uploadResponse = await fetch(upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
    },
    body: bytes,
  });

  if (!uploadResponse.ok) {
    console.warn("CDN upload failed, using data URL fallback");
    return base64Data;
  }

  return file_url;
}
