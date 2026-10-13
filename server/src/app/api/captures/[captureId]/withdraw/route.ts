import {NextRequest,NextResponse} from "next/server";
import {apiContext,failure} from "@/middleware/api";
export async function POST(request:NextRequest,{params}:{params:Promise<{captureId:string}>}){
 const ctx=await apiContext(request,true);if("response" in ctx)return ctx.response;
 try{const {captureId}=await params;const body=await request.json();const {error}=await ctx.client.rpc("alvis_withdraw_capture",{org:ctx.member.organization_id,capture:captureId,confirmation:body.confirmation});if(error)return failure("Recording unavailable or confirmation does not match. Only its expert owner or administrator can withdraw it.",403);return NextResponse.json({ok:true});}catch{return failure("Unable to withdraw evidence.",400);}
}
