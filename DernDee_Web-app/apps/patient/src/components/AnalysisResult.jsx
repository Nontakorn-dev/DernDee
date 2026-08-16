import { Navigate, useLocation } from 'react-router-dom';

const AnalysisResult = () => {
    const location = useLocation();
    const sessionId = location.state?.session?.id;
    const search = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';

    return <Navigate to={`/walk-summary${search}`} replace state={location.state} />;
};

export default AnalysisResult;
