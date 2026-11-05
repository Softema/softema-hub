'use client';
import React,{useLayoutEffect,useRef,useState} from 'react';
import {ResponsiveContainer} from 'recharts';
// Recharts measures its parent only after the first render (-1×-1) and reads 0×0 inside display:none parents.
// Mount the chart only while the box has a real size and hand that size over as the initial dimension.
export function ChartBox({children}:{children:React.ReactElement}){const ref=useRef<HTMLDivElement>(null);const [size,setSize]=useState<{width:number;height:number}|null>(null);useLayoutEffect(()=>{const el=ref.current;if(!el)return;const observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;const next=width>0&&height>0?{width:Math.round(width),height:Math.round(height)}:null;setSize(s=>(s===null)===(next===null)?s:next)});observer.observe(el);return()=>observer.disconnect()},[]);return <div ref={ref} style={{width:'100%',height:'100%',minWidth:0}}>{size&&<ResponsiveContainer width="100%" height="100%" initialDimension={size}>{children}</ResponsiveContainer>}</div>}
