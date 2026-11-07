'use client';
import {useEffect,useRef,useState} from 'react';
export default function PatientCamera({onChange,disabled=false}:{onChange:(photo:Blob|null)=>void;disabled?:boolean}){
 const video=useRef<HTMLVideoElement>(null);const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 const [active,setActive]=useState(false),[ready,setReady]=useState(false),[preview,setPreview]=useState(''),[error,setError]=useState('');
 useEffect(()=>{onChange(null)},[onChange]);
 useEffect(()=>{
  if(!active)return;
  let disposed=false;let stream:MediaStream|undefined;setReady(false);setError('');
  async function start(){try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('A câmera precisa de HTTPS e de um navegador compatível.');
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
   if(disposed){stream.getTracks().forEach(track=>track.stop());return}
   if(video.current){video.current.srcObject=stream;await video.current.play()}
  }catch(e){if(!disposed){setActive(false);setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Permita o acesso à câmera nas configurações do navegador e tente novamente.':e instanceof DOMException&&e.name==='NotFoundError'?'Nenhuma câmera foi encontrada neste computador.':e instanceof DOMException&&e.name==='NotReadableError'?'A câmera está em uso ou indisponível. Feche outros aplicativos e tente novamente.':e instanceof Error?e.message:'Não foi possível abrir a câmera.')}}}
  void start();return()=>{disposed=true;stream?.getTracks().forEach(track=>track.stop())};
 },[active]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 async function takePhoto(){const element=video.current;if(!element?.videoWidth||disabled)return;
  const canvas=document.createElement('canvas');const scale=Math.min(1,640/element.videoWidth,640/element.videoHeight);canvas.width=Math.round(element.videoWidth*scale);canvas.height=Math.round(element.videoHeight*scale);
  const context=canvas.getContext('2d');if(!context){setError('Não foi possível capturar a foto.');return}context.drawImage(element,0,0,canvas.width,canvas.height);
  // Capture synchronously before releasing the camera; JPEG stays under the upload limit.
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));
  if(!mounted.current)return;
  if(!blob||blob.size>512*1024){setError('Não foi possível gerar a foto. Tente novamente.');return}
  setPreview(URL.createObjectURL(blob));onChange(blob);setActive(false);setReady(false);
 }
 return <section className="patient-camera" aria-label="Foto do paciente"><b>Foto do paciente (opcional)</b><p>A câmera será aberta após sua autorização. Confira a foto antes de salvar o cadastro.</p>{active&&<video ref={video} autoPlay muted playsInline onLoadedData={()=>setReady(true)} aria-label="Prévia da câmera"/>}{!active&&preview&&<img src={preview} alt="Foto capturada do paciente"/>}{error&&<div className="error" role="alert">{error}</div>}<div className="camera-actions">{active?<><button className="primary" type="button" disabled={!ready||disabled} onClick={takePhoto}>Tirar foto</button><button className="secondary" type="button" disabled={disabled} onClick={()=>setActive(false)}>Fechar câmera</button></>:<button className="secondary" type="button" disabled={disabled} onClick={()=>setActive(true)}>{preview?'Tirar outra foto':'Abrir câmera'}</button>}{preview&&<button className="text-button" type="button" disabled={disabled} onClick={()=>{setPreview('');onChange(null)}}>Descartar foto</button>}</div></section>
}
