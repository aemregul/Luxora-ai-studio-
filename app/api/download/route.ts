import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json({ error: 'Download failed' }, { status: response.status });
    }

    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': blob.type || 'image/png',
        'Content-Disposition': `attachment; filename="luxora-design.png"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
