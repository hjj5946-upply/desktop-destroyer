import ReactDOM from 'react-dom/client';
import App from './App';

// StrictMode는 일부러 쓰지 않는다.
// 개발 모드에서 effect가 두 번 실행되면 오버레이 준비 신호(overlay_ready)가 중복될 수 있기 때문.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
