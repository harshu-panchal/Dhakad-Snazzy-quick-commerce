import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useLoading } from '../context/LoadingContext';

const useRouteLoader = () => {
  const location = useLocation();
  const { startRouteLoading, stopRouteLoading } = useLoading();
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Start loader on navigation
    // On initial mount, the LoadingProvider already started it (count=1)
    if (!isInitialMount.current) {
      startRouteLoading();
    } else {
      isInitialMount.current = false;
    }

    // By the time this effect runs, the new route has already committed and
    // painted, so stop immediately - no artificial delay.
    stopRouteLoading();
  }, [location.pathname, startRouteLoading, stopRouteLoading]);
};

export default useRouteLoader;
