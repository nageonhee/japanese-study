/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Categories } from './pages/Categories';
import { Wordbook } from './pages/Wordbook';
import { MyPage } from './pages/MyPage';
import { PostView } from './pages/PostView';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/wordbook" element={<Wordbook />} />
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/posts/:id" element={<PostView />} />
      </Routes>
    </Layout>
  );
}
