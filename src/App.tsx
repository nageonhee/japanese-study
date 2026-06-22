import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { PersonalStudy } from './pages/PersonalStudy';
import { Categories } from './pages/Categories';
import { Wordbook } from './pages/Wordbook';
import { MyPage } from './pages/MyPage';
import { PostView } from './pages/PostView';
import { LoginSignup } from './pages/LoginSignup';
import { AdminUsers } from './pages/AdminUsers';
import { useStore } from './store';

export default function App() {
  const { user } = useStore();
  const isSharedMode = import.meta.env.VITE_APP_MODE !== 'LOCAL';

  if (isSharedMode && !user) {
    return <LoginSignup />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/personal" element={<PersonalStudy />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/wordbook" element={<Wordbook />} />
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/posts/:id" element={<PostView />} />
        <Route path="/admin/users" element={<AdminUsers />} />
      </Routes>
    </Layout>
  );
}
