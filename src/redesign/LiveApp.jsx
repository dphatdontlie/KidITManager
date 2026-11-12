import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, BookOpen, Users, UserRound, ClipboardCheck, Wallet, Wrench, Settings2, Menu, X, Sun, Moon, LogOut, CheckCheck, MessagesSquare, Bell } from 'lucide-react';
import { useCenter } from './center-context';
import { Icon, Button, Avatar, EditDialog, Feedback } from './ui';
import { Dashboard, Schedule, Classes, ClassDetail, Students, Teachers, Payroll, Finance, Accounts } from './Views';
import { TeachingTools } from '../pages/TeachingTools';
import { TimerIndicator } from '../components/CountdownTimer';

const nav=[['/','Tổng quan',LayoutDashboard,''],['/schedule','Lịch dạy',CalendarDays,'Giảng dạy'],['/assistant','Trợ lý điều phối',MessagesSquare,''],['/classes','Lớp học',BookOpen,''],['/students','Học sinh',Users,''],['/payroll','Chấm công',ClipboardCheck,''],['/teachers','Giáo viên',UserRound,'Trung tâm'],['/finance','Học phí',Wallet,''],['/tools','Công cụ trên lớp',Wrench,''],['/notifications','Thông báo',Bell,''],['/accounts','Tài khoản',Settings2,'']];

function MobileMenu({children,close}){
  const ref=useRef(null);
  useEffect(()=>{const previous=document.activeElement;const dialog=ref.current;dialog.showModal();return()=>{dialog.close();previous?.focus();};},[]);
  return <dialog className="mobile-drawer" ref={ref} aria-label="Menu chức năng" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===ref.current)close();}}><button className="drawer-close icon-button" onClick={close} aria-label="Đóng menu"><Icon icon={X}/></button><div onClick={e=>{if(e.target.closest('a'))close();}}>{children}</div></dialog>;
}
function DetailRoute(){const {id}=useParams();return <ClassDetail key={id} id={Number(id)}/>;}

export default function LiveApp({theme,setTheme,children}){
  const d=useCenter();const location=useLocation();const [menu,setMenu]=useState(false);const mainRef=useRef(null);
  useEffect(()=>{setMenu(false);window.scrollTo(0,0);},[location.pathname]);
  const current=nav.find(([path])=>path==='/'?location.pathname==='/':location.pathname.startsWith(path));
  useEffect(()=>{mainRef.current?.focus({preventScroll:true});const previous=document.title;document.title=`${location.pathname.startsWith('/classes/')?'Chi tiết lớp':current?.[1]||'KidIT'} | KidIT Manager`;return()=>{document.title=previous;};},[location.pathname,current]);
  const links=nav.filter(([path])=>!['/accounts','/assistant'].includes(path)||d.role==='admin');
  const sidebar=<><Link className="brand" to="/"><span className="brand-mark">KI</span><span><strong>KidIT</strong><small>Sổ điều phối trung tâm</small></span></Link><div className="center-label"><span>Cơ sở KidIT</span><small>Không gian quản lý</small></div><nav aria-label="Điều hướng chính">{links.map(([path,title,icon,group])=><div key={path}>{group&&<p className="nav-group">{group}</p>}<NavLink to={path} end={path==='/'} className={({isActive})=>`nav-link ${isActive?'active':''}`} aria-label={title}><Icon icon={icon}/><span>{title}</span>{path==='/classes'&&<small aria-hidden="true">{d.classes.length}</small>}</NavLink></div>)}</nav><div className="sidebar-bottom"><p>Cùng giữ lớp học gọn gàng.</p><small>KidIT Manager</small></div></>;
  return <><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();mainRef.current?.focus();}}>Đến nội dung chính</a><div className="app-shell live-shell"><aside className="sidebar">{sidebar}</aside><div className="workspace"><header className="topbar"><div className="topbar-left"><Button variant="ghost mobile-menu" icon={Menu} onClick={()=>setMenu(true)}>Menu</Button><span className="location-label">Không gian làm việc <span>/</span><strong>{location.pathname.startsWith('/classes/')?'Chi tiết lớp':current?.[1]||'KidIT'}</strong></span></div><div className="topbar-right"><TimerIndicator/><button className="icon-button theme-button" aria-label={theme==='light'?'Chuyển sang giao diện tối':'Chuyển sang giao diện sáng'} onClick={()=>setTheme(v=>v==='light'?'dark':'light')}><Icon icon={theme==='light'?Moon:Sun}/></button><div className="user-identity"><Avatar name={d.user.name}/><div><strong>{d.user.name}</strong><small>{d.role==='admin'?'Quản trị viên':`Giáo viên · ${d.user.username}`}</small></div></div><button className="icon-button" disabled={d.auth.busy} aria-label="Đăng xuất" onClick={d.auth.logout}><Icon icon={LogOut}/></button></div></header>
    <main id="main-content" ref={mainRef} tabIndex={-1}><Feedback error={d.coreError} retry={()=>d.refreshCore()}/>{!d.ready?<section className="state-panel">{d.coreError?<><h1>Chưa tải được dữ liệu</h1><p>Kiểm tra kết nối rồi thử lại.</p><Button onClick={()=>d.refreshCore()}>Thử lại</Button></>:<><span className="loading-mark"/><p role="status">Đang tải thông tin trung tâm...</p></>}</section>:children}<footer className="page-footer"><span>KidIT · Sổ điều phối trung tâm</span><span>{d.user.name} · {d.role==='admin'?'Admin':'Giáo viên'}</span></footer></main></div></div>
    <nav className="bottom-nav" aria-label="Điều hướng trên điện thoại">{links.filter(([path])=>['/','/schedule','/payroll'].includes(path)).map(([path,title,icon])=><NavLink key={path} to={path} end={path==='/'} className={({isActive})=>isActive?'active':''}><Icon icon={icon}/><span>{title}</span></NavLink>)}<button onClick={()=>setMenu(true)}><Icon icon={Menu}/><span>Tất cả</span></button></nav>
    {menu&&<MobileMenu close={()=>setMenu(false)}>{sidebar}</MobileMenu>}{d.model&&<EditDialog key={d.model.title} model={d.model} close={d.close}/>} {d.notice&&<div className="toast" role="status"><Icon icon={CheckCheck}/><p>{d.notice}</p><button className="icon-button" aria-label="Đóng thông báo" onClick={d.dismiss}><Icon icon={X} size={16}/></button></div>}
  </>;
}
export { Dashboard, Schedule, Classes, DetailRoute, Students, Teachers, Payroll, Finance, Accounts, TeachingTools };
