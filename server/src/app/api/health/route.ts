import {NextResponse} from "next/server";
import {configured} from "@/database/supabase";
export async function GET(){return NextResponse.json({status:configured()?"ready":"unconfigured"},{status:configured()?200:503,headers:{"Cache-Control":"no-store"}});}
