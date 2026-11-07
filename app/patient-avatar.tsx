'use client';
import {useEffect,useState} from 'react';
export default function PatientAvatar({clinic,id,name,version=0}:{clinic:string;id:string;name:string;version?:number}){
 const src='/api/patient-photo?'+new URLSearchParams({clinic,patient:id,v:String(version)});
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
 return <span className="avatar patient-avatar">{failed?name.slice(0,2).toUpperCase():<img src={src} alt={'Foto de '+name} loading="lazy" onError={()=>setFailed(true)}/>}</span>
}
