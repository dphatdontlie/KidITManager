import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { TimerProvider } from './components/TimerProvider';
import { TimerPopupPage } from './pages/TeachingTools';
import { CenterProvider } from './redesign/CenterProvider';
import LiveApp, { Dashboard, Schedule, Classes, DetailRoute, Students, Teachers, Payroll, Finance, Accounts, TeachingTools } from './redesign/LiveApp';
import { Empty } from './redesign/ui';
import './redesign/approved.css';
import './redesign/production.css';
import { QuizStudent } from './quiz/QuizStudent';
import Assistant from './redesign/Assistant';

function initialTheme(){try{return localStorage.getItem('kidit-interface-theme')==='dark'?'dark':'light';}catch{return 'light';}}
function ProtectedApp(){
  const [theme,setTheme]=useState(initialTheme);
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('kidit-interface-theme',theme);}catch{/* Theme still works when browser storage is unavailable. */}},[theme]);
  return <AuthProvider><TimerProvider><Routes><Route path="/tools/timer" element={<TimerPopupPage/>}/><Route path="*" element={<CenterProvider><LiveApp theme={theme} setTheme={setTheme}><Routes><Route path="/" element={<Dashboard/>}/><Route path="/schedule" element={<Schedule/>}/><Route path="/assistant" element={<Assistant/>}/><Route path="/classes" element={<Classes/>}/><Route path="/classes/:id" element={<DetailRoute/>}/><Route path="/students" element={<Students/>}/><Route path="/teachers" element={<Teachers/>}/><Route path="/payroll" element={<Payroll/>}/><Route path="/finance" element={<Finance/>}/><Route path="/accounts" element={<Accounts/>}/><Route path="/tools" element={<TeachingTools/>}/><Route path="/courses" element={<Navigate to="/classes" replace/>}/><Route path="*" element={<Empty title="Không tìm thấy trang" action={<a className="button" href="/">Về tổng quan</a>}/>}/></Routes></LiveApp></CenterProvider>}/></Routes></TimerProvider></AuthProvider>;
}

export default function App(){
  return <BrowserRouter><Routes><Route path="/play" element={<QuizStudent/>}/><Route path="/play/:code" element={<QuizStudent/>}/><Route path="*" element={<ProtectedApp/>}/></Routes></BrowserRouter>;
}
