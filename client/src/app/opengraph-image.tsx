import {ImageResponse} from "next/og";
export const size={width:1200,height:630};
export const contentType="image/png";
export const alt="Alvis: Keep the judgment. Share the knowledge.";
export default function SocialPreview(){return new ImageResponse(<div style={{width:"100%",height:"100%",background:"#173e32",color:"#f5f7f3",display:"flex",flexDirection:"column",justifyContent:"center",padding:80,fontFamily:"sans-serif"}}><div style={{fontSize:64,fontWeight:700,marginBottom:60}}>alvis.</div><div style={{fontSize:76,fontWeight:700}}>Keep the judgment.</div><div style={{fontSize:76,fontWeight:700}}>Share the knowledge.</div><div style={{fontSize:30,marginTop:50}}>Reviewed knowledge. Contextual learning.</div></div>,size);}
