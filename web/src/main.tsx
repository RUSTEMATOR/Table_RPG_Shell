import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { MeProvider } from './lib/me.tsx';
import { Gm, GmMembers, GmParty } from './routes/Gm.tsx';
import { GmNotes } from './routes/GmNotes.tsx';
import { GmRequests } from './routes/GmRequests.tsx';
import { GmCharacter } from './routes/GmCharacter.tsx';
import { GmJev } from './routes/GmJev.tsx';
import { GmNew } from './routes/GmNew.tsx';
import { Home } from './routes/Home.tsx';
import { Join } from './routes/Join.tsx';
import { Login } from './routes/Login.tsx';
import { Player } from './routes/Player.tsx';
import { Table } from './routes/Table.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/join/:token" element={<Join />} />
          <Route path="/player" element={<Player />} />
          <Route path="/gm" element={<Gm />} />
          <Route path="/gm/party" element={<GmParty />} />
          <Route path="/gm/requests" element={<GmRequests />} />
          <Route path="/gm/notes" element={<GmNotes />} />
          <Route path="/gm/members" element={<GmMembers />} />
          <Route path="/gm/jev" element={<GmJev />} />
          <Route path="/gm/new" element={<GmNew />} />
          <Route path="/gm/char/:id" element={<GmCharacter />} />
          <Route path="/table" element={<Table />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </MeProvider>
  </StrictMode>,
);
