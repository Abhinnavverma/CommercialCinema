import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.js";
import { CinemaSocketProvider } from "./context/CinemaSocketContext.js";
import { AdminView } from "./components/admin/AdminView.js";
import { PatronView } from "./components/patron/PatronView.js";
import { Layout } from "./components/shared/Layout.js";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CinemaSocketProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<PatronView />} />
              <Route path="/admin" element={<AdminView />} />
            </Route>
          </Routes>
        </CinemaSocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
