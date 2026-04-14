import { NextRequest, NextResponse } from 'next/server';

const WORLDLABS_API = 'https://api.worldlabs.ai/marble/v1';

export async function POST(request: NextRequest) {
  try {
    const { images, displayName, textPrompt, model } = await request.json();

    if (!images || images.length === 0) {
      return NextResponse.json({ error: 'En az bir görsel gereklidir' }, { status: 400 });
    }

    const API_KEY = process.env.WORLDLABS_API_KEY;
    if (!API_KEY) {
      return NextResponse.json({ error: 'World Labs API anahtarı yapılandırılmamış. .env.local dosyasına WORLDLABS_API_KEY ekleyin.' }, { status: 500 });
    }

    console.log("=== WORLD LABS 3D GENERATION ===");
    console.log("Images count:", images.length);
    console.log("Model:", model || "marble-1.1");

    let worldPrompt: Record<string, unknown>;

    if (images.length === 1) {
      // ============================================
      // TEK GÖRSEL → image prompt
      // ============================================
      const imageUrl = images[0].url;

      // Eğer base64 ise önce upload et
      if (imageUrl.startsWith('data:')) {
        const mediaAssetId = await uploadImageToWorldLabs(imageUrl, API_KEY);
        worldPrompt = {
          type: "image",
          image_prompt: {
            source: "media_asset",
            media_asset_id: mediaAssetId,
          },
          ...(textPrompt ? { text_prompt: textPrompt } : {}),
        };
      } else {
        worldPrompt = {
          type: "image",
          image_prompt: {
            source: "uri",
            uri: imageUrl,
          },
          ...(textPrompt ? { text_prompt: textPrompt } : {}),
        };
      }
    } else {
      // ============================================
      // ÇOKLU GÖRSEL → multi-image prompt
      // ============================================
      const multiImagePrompt = [];

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const azimuth = img.azimuth ?? Math.round((360 / images.length) * i);

        if (img.url.startsWith('data:')) {
          const mediaAssetId = await uploadImageToWorldLabs(img.url, API_KEY);
          multiImagePrompt.push({
            azimuth: azimuth,
            content: {
              source: "media_asset",
              media_asset_id: mediaAssetId,
            },
          });
        } else {
          multiImagePrompt.push({
            azimuth: azimuth,
            content: {
              source: "uri",
              uri: img.url,
            },
          });
        }
      }

      worldPrompt = {
        type: "multi-image",
        multi_image_prompt: multiImagePrompt,
        ...(textPrompt ? { text_prompt: textPrompt } : {}),
      };
    }

    // ============================================
    // DÜNYA OLUŞTUR
    // ============================================
    const generateResponse = await fetch(`${WORLDLABS_API}/worlds:generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "WLT-Api-Key": API_KEY,
      },
      body: JSON.stringify({
        display_name: displayName || "AI Mimar 3D Tasarım",
        model: model || "marble-1.1",
        world_prompt: worldPrompt,
      }),
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error("World Labs generation error:", errorText);
      throw new Error(`3D dünya oluşturulamadı: ${generateResponse.status}`);
    }

    const generateData = await generateResponse.json();
    console.log("World generation started:", generateData.operation_id);

    return NextResponse.json({
      success: true,
      operationId: generateData.operation_id,
    });

  } catch (error) {
    console.error('Create world error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '3D dünya oluşturulamadı'
    }, { status: 500 });
  }
}

// ============================================
// UPLOAD IMAGE TO WORLD LABS
// ============================================
async function uploadImageToWorldLabs(base64Data: string, apiKey: string): Promise<string> {
  const ext = base64Data.includes('image/png') ? 'png' : 'jpg';
  const fileName = `room_${Date.now()}.${ext}`;

  // 1. Upload hazırla
  const prepareResponse = await fetch(`${WORLDLABS_API}/media-assets:prepare_upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "WLT-Api-Key": apiKey,
    },
    body: JSON.stringify({
      file_name: fileName,
      kind: "image",
      extension: ext,
    }),
  });

  if (!prepareResponse.ok) {
    const errText = await prepareResponse.text();
    console.error("Prepare upload error:", errText);
    throw new Error(`Upload hazırlanamadı: ${prepareResponse.status}`);
  }

  const prepareData = await prepareResponse.json();
  console.log("Prepare upload response keys:", JSON.stringify(Object.keys(prepareData)));

  // Farklı response yapılarını destekle
  const mediaAssetId = prepareData?.media_asset?.id
    || prepareData?.mediaAsset?.id
    || prepareData?.id;

  const uploadUrl = prepareData?.upload_info?.upload_url
    || prepareData?.uploadInfo?.uploadUrl
    || prepareData?.upload_url;

  const requiredHeaders = prepareData?.upload_info?.required_headers
    || prepareData?.uploadInfo?.requiredHeaders
    || {};

  if (!mediaAssetId || !uploadUrl) {
    console.error("Full prepare response:", JSON.stringify(prepareData));
    throw new Error("Upload bilgileri alınamadı");
  }

  // 2. Base64'ü binary'e çevir
  const rawBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const binaryData = Buffer.from(rawBase64, 'base64');

  // 3. Upload et
  const uploadHeaders: Record<string, string> = {
    "Content-Type": `image/${ext}`,
  };

  if (requiredHeaders && typeof requiredHeaders === 'object') {
    Object.entries(requiredHeaders).forEach(([key, value]) => {
      uploadHeaders[key] = value as string;
    });
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: uploadHeaders,
    body: binaryData,
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    console.error("Upload error:", errText);
    throw new Error(`Görsel yüklenemedi: ${uploadResponse.status}`);
  }

  console.log("Image uploaded successfully, media asset ID:", mediaAssetId);
  return mediaAssetId;
}
