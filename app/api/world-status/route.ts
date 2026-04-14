import { NextRequest, NextResponse } from 'next/server';

const WORLDLABS_API = 'https://api.worldlabs.ai/marble/v1';

export async function GET(request: NextRequest) {
  try {
    const operationId = request.nextUrl.searchParams.get('operationId');

    if (!operationId) {
      return NextResponse.json({ error: 'Operation ID gereklidir' }, { status: 400 });
    }

    const API_KEY = process.env.WORLDLABS_API_KEY;
    if (!API_KEY) {
      return NextResponse.json({ error: 'World Labs API anahtarı yapılandırılmamış' }, { status: 500 });
    }

    const response = await fetch(`${WORLDLABS_API}/operations/${operationId}`, {
      method: "GET",
      headers: {
        "WLT-Api-Key": API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.done && data.response) {
      // Tamamlandı
      const world = data.response;
      return NextResponse.json({
        status: "completed",
        worldId: world.id,
        worldUrl: world.world_marble_url,
        assets: world.assets,
      });
    } else if (data.error) {
      return NextResponse.json({
        status: "failed",
        error: data.error,
      });
    } else {
      // Hala devam ediyor
      const progress = data.metadata?.progress;
      return NextResponse.json({
        status: "processing",
        progress: progress?.status || "IN_PROGRESS",
        description: progress?.description || "3D dünya oluşturuluyor...",
        worldId: data.metadata?.world_id,
      });
    }

  } catch (error) {
    console.error('World status error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Durum kontrol edilemedi'
    }, { status: 500 });
  }
}
