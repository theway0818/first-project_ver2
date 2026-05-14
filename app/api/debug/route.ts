import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET() {
  const url = process.env.DATABASE_URL;
  try {
    const sql = neon(url!);
    const result = await sql`SELECT 1 as ok`;
    return NextResponse.json({ defined: true, length: url?.length, neonTest: result[0] });
  } catch (e) {
    return NextResponse.json({ defined: !!url, length: url?.length, error: String(e) });
  }
}
