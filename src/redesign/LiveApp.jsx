import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, BookOpen, Users, UserRound, ClipboardCheck, Wallet, Wrench, Settings2, Menu, X, Sun, Moon, LogOut, CheckCheck, MessagesSquare, Bell } from 'lucide-react';
import { useCenter } from './center-context';
import { Icon, Button, Avatar, EditDialog, Feedback } from './ui';
import { Schedule, ClassDetail, Students, Teachers, Payroll, Finance, Accounts } from './Views';
import { Dashboard, Classes } from './TeachingOverview';
import { TeachingTools } from '../pages/TeachingTools';
import { TimerIndicator } from '../components/CountdownTimer';
import StaffPresence from './StaffPresence';

const items = {
  home: ['/', 'Hôm nay', LayoutDashboard], schedule: ['/schedule', 'Lịch dạy', CalendarDays],
  classes: ['/classes', 'Lớp học', BookOpen], students: ['/students', 'Học sinh', Users],
  payroll: ['/payroll', 'Công của tôi', ClipboardCheck], teachers: ['/teachers', 'Giáo viên và trợ giảng', UserRound],
  finance: ['/finance', 'Học phí', Wallet], tools: ['/tools', 'Công cụ trên lớp', Wrench],
  notifications: ['/notifications', 'Thông báo', Bell], accounts: ['/accounts', 'Tài khoản', Settings2],
  assistant: ['/assistant', 'Trợ lý điều phối', MessagesSquare],
};
const teacherGroups = [
  ['Giảng dạy', [items.home, items.schedule, items.classes, items.students, items.payroll]],
  ['Công cụ và tiện ích', [items.tools, items.notifications]],
  ['Trung tâm', [items.teachers, items.finance]],
];
const adminGroups = [
  ['Điều phối', [['/', 'Điều hành', LayoutDashboard], items.schedule, items.classes, items.students, items.assistant]],
  ['Quản lý trung tâm', [items.teachers, ['/payroll', 'Sổ công', ClipboardCheck], items.finance, items.accounts]],
  ['Công cụ và tiện ích', [items.tools, items.notifications]],
];

function MobileMenu({children,close}){
  const ref=useRef(null);
  useEffect(()=>{const previous=document.activeElement;const dialog=ref.current;dialog.showModal();return()=>{dialog.close();previous?.focus();};},[]);
  return <dialog className="mobile-drawer" ref={ref} aria-label="Menu chức năng" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===ref.current)close();}}><button className="drawer-close icon-button" onClick={close} aria-label="Đóng menu"><Icon icon={X}/></button><div onClick={e=>{if(e.target.closest('a'))close();}}>{children}</div></dialog>;
}
function DetailRoute(){const {id}=useParams();return <ClassDetail key={id} id={Number(id)}/>;}

export default function LiveApp({theme,setTheme,children}){
  const d=useCenter();const location=useLocation();const [menu,setMenu]=useState(false);const mainRef=useRef(null);
  useEffect(()=>{setMenu(false);window.scrollTo(0,0);},[location.pathname]);
  const groups=d.role==='admin'?adminGroups:teacherGroups;
  const links=groups.flatMap(([,group])=>group);
  const current=links.find(([path])=>path==='/'?location.pathname==='/':location.pathname.startsWith(path));
  useEffect(()=>{mainRef.current?.focus({preventScroll:true});const previous=document.title;document.title=`${location.pathname.startsWith('/classes/')?'Chi tiết lớp':current?.[1]||'KidIT'} | KidIT Manager`;return()=>{document.title=previous;};},[location.pathname,current]);
  const sidebar=<><Link className="brand" to="/"><span className="brand-mark">KI</span><strong>KidIT</strong></Link>
    <nav aria-label="Điều hướng chính">{groups.map(([name,group])=><div key={name}>
      <p className="nav-group">{name}</p>
      {group.map(([path,title,icon])=><NavLink key={path} to={path} end={path==='/'} className={({isActive})=>`nav-link ${isActive?'active':''}`}><Icon icon={icon}/><span>{title}</span></NavLink>)}
    </div>)}</nav></>;
  return <><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();mainRef.current?.focus();}}>Đến nội dung chính</a><div className="app-shell live-shell"><aside className="sidebar">{sidebar}</aside><div className="workspace"><header className="topbar"><div className="topbar-left"><span className="location-label"><span>{d.role==='admin'?'Quản trị':'Giáo viên'}</span> / <strong>{location.pathname.startsWith('/classes/')?'Chi tiết lớp':current?.[1]||'KidIT'}</strong></span></div><div className="topbar-right"><TimerIndicator/><StaffPresence accountId={d.user.accountId}/><button className="icon-button theme-button" aria-label={theme==='light'?'Chuyển sang giao diện tối':'Chuyển sang giao diện sáng'} onClick={()=>setTheme(v=>v==='light'?'dark':'light')}><Icon icon={theme==='light'?Moon:Sun}/></button><div className="user-identity"><Avatar name={d.user.name}/><div><strong>{d.user.name}</strong><small>{d.role==='admin'?'Quản trị viên':`Giáo viên · ${d.user.username}`}</small></div></div><button className="icon-button" disabled={d.auth.busy} aria-label="Đăng xuất" onClick={d.auth.logout}><Icon icon={LogOut}/></button></div></header>
    <main id="main-content" ref={mainRef} tabIndex={-1}><Feedback error={d.coreError} retry={()=>d.refreshCore()}/>{!d.ready?<section className="state-panel">{d.coreError?<><h1>Chưa tải được dữ liệu</h1><p>Kiểm tra kết nối rồi thử lại.</p><Button onClick={()=>d.refreshCore()}>Thử lại</Button></>:<><span className="loading-mark"/><p role="status">Đang tải thông tin trung tâm...</p></>}</section>:children}</main></div></div>
    <nav className="bottom-nav workspace-bottom-nav" aria-label="Điều hướng trên điện thoại">{links.filter(([path])=>['/','/schedule','/classes','/payroll'].includes(path)).map(([path,title,icon])=><NavLink key={path} to={path} end={path==='/'} className={({isActive})=>isActive?'active':''}><Icon icon={icon}/><span>{path==='/payroll'?'Sổ công':title}</span></NavLink>)}<button onClick={()=>setMenu(true)}><Icon icon={Menu}/><span>Thêm</span></button></nav>
    {menu&&<MobileMenu close={()=>setMenu(false)}>{sidebar}</MobileMenu>}{d.model&&<EditDialog key={d.model.title} model={d.model} close={d.close}/>} {d.notice&&<div className="toast" role="status"><Icon icon={CheckCheck}/><p>{d.notice}</p><button className="icon-button" aria-label="Đóng thông báo" onClick={d.dismiss}><Icon icon={X} size={16}/></button></div>}
  </>;
}
export { Dashboard, Schedule, Classes, DetailRoute, Students, Teachers, Payroll, Finance, Accounts, TeachingTools };
