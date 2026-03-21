import React, { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const CATEGORIES = [
  "Apuestas",
  "Casa",
  "Comida",
  "Conversión ARS<->USD",
  "Farmacia",
  "Honorarios",
  "Inversiones",
  "Mantenimiento",
  "Ocio",
  "Regalos",
  "Salidas (Ej: Boliche)",
  "Sueldo",
  "Supermercado",
  "Telefono",
  "Transporte",
  "Otros",
];

const DEFAULT_CATEGORY = "Otros";

const emptyMonth = () => ({
  ingresos: [],
  gastos: [],
  ahorroInicialARS: 0,
  ahorroInicialUSD: 0,
});

const createInitialYearData = () => {
  const obj = {};
  MONTHS.forEach((month) => {
    obj[month] = emptyMonth();
  });
  return obj;
};

const hydrateYearData = (months = {}) => {
  const base = createInitialYearData();

  MONTHS.forEach((month) => {
    const incoming = months[month] || {};
    base[month] = {
      ...emptyMonth(),
      ...incoming,
      ingresos: Array.isArray(incoming.ingresos)
        ? incoming.ingresos.map((item) => ({ ...item, categoria: item.categoria || DEFAULT_CATEGORY }))
        : [],
      gastos: Array.isArray(incoming.gastos)
        ? incoming.gastos.map((item) => ({ ...item, categoria: item.categoria || DEFAULT_CATEGORY }))
        : [],
    };
  });

  return base;
};

export default function App() {
  const currentYear = new Date().getFullYear();
  const currentMonth = MONTHS[new Date().getMonth()] || "Enero";

  const [year, setYear] = useState(String(currentYear));
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [data, setData] = useState(createInitialYearData());
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [uid, setUid] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [loadedYear, setLoadedYear] = useState(null);
  const [cloudStatus, setCloudStatus] = useState("Conectando...");
  const [cloudError, setCloudError] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("Todas");
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState("login");
  const [authForm, setAuthForm] = useState({
    nombre: "",
    email: "",
    password: "",
    repeatPassword: "",
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const root = document.getElementById("root");
    const html = document.documentElement;
    const body = document.body;

    const previous = {
      rootMaxWidth: root?.style.maxWidth || "",
      rootWidth: root?.style.width || "",
      rootMargin: root?.style.margin || "",
      rootPadding: root?.style.padding || "",
      htmlOverflowX: html.style.overflowX || "",
      bodyOverflowX: body.style.overflowX || "",
      bodyMargin: body.style.margin || "",
    };

    if (root) {
      root.style.maxWidth = "none";
      root.style.width = "100%";
      root.style.margin = "0";
      root.style.padding = "0";
    }

    html.style.overflowX = "hidden";
    body.style.overflowX = "hidden";
    body.style.margin = "0";

    return () => {
      if (root) {
        root.style.maxWidth = previous.rootMaxWidth;
        root.style.width = previous.rootWidth;
        root.style.margin = previous.rootMargin;
        root.style.padding = previous.rootPadding;
      }
      html.style.overflowX = previous.htmlOverflowX;
      body.style.overflowX = previous.bodyOverflowX;
      body.style.margin = previous.bodyMargin;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (cancelled) return;

      setAuthReady(true);

      if (user) {
        setCurrentUser(user);
        setUid(user.uid);
        setCloudStatus("Sesión conectada");
        setAuthError("");
        return;
      }

      setCurrentUser(null);
      setUid("");
      setLoadedYear(null);
      setData(createInitialYearData());
      setCloudStatus("Esperando inicio de sesión");
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !uid) return;

    let cancelled = false;

    const loadYear = async () => {
      setLoadedYear(null);
      setCloudError("");
      setCloudStatus("Cargando datos...");

      try {
        const ref = doc(db, "users", uid, "budgetYears", year);
        const snap = await getDoc(ref);

        if (cancelled) return;

        if (snap.exists() && snap.data()?.months) {
          setData(hydrateYearData(snap.data().months));
          setCloudStatus("Datos cargados");
        } else {
          const initial = createInitialYearData();
          setData(initial);
          await setDoc(
            ref,
            {
              year,
              months: initial,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
          if (cancelled) return;
          setCloudStatus("Año creado");
        }

        setLoadedYear(year);
      } catch (error) {
        console.error(error);
        if (cancelled) return;
        setData(createInitialYearData());
        setLoadedYear(year);
        setCloudStatus("Error al cargar");
        setCloudError("No se pudieron leer los datos guardados en Firebase.");
      }
    };

    loadYear();

    return () => {
      cancelled = true;
    };
  }, [authReady, uid, year]);

  useEffect(() => {
    if (!uid || loadedYear !== year) return;

    const timeout = setTimeout(async () => {
      try {
        setCloudStatus("Guardando...");
        await setDoc(
          doc(db, "users", uid, "budgetYears", year),
          {
            year,
            months: data,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        setCloudStatus("Sincronizado");
        setCloudError("");
      } catch (error) {
        console.error(error);
        setCloudStatus("Error al guardar");
        setCloudError("No se pudieron guardar los cambios en Firebase.");
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [data, uid, year, loadedYear]);


  const resetAuthFeedback = () => {
    setAuthError("");
    setAuthInfo("");
  };

  const updateAuthField = (field, value) => {
    setAuthForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegister = async () => {
    resetAuthFeedback();

    const nombre = authForm.nombre.trim();
    const email = authForm.email.trim();
    const password = authForm.password;
    const repeatPassword = authForm.repeatPassword;

    if (!nombre) {
      setAuthError("Ingresá tu nombre.");
      return;
    }

    if (!email) {
      setAuthError("Ingresá tu email.");
      return;
    }

    if (password.length < 6) {
      setAuthError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== repeatPassword) {
      setAuthError("Las contraseñas no coinciden.");
      return;
    }

    try {
      setAuthLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: nombre });
      setAuthInfo("Cuenta creada correctamente.");
    } catch (error) {
      console.error(error);
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    resetAuthFeedback();

    const email = authForm.email.trim();
    const password = authForm.password;

    if (!email || !password) {
      setAuthError("Completá email y contraseña.");
      return;
    }

    try {
      setAuthLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error(error);
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    resetAuthFeedback();

    const email = authForm.email.trim();

    if (!email) {
      setAuthError("Ingresá tu email para recuperar la contraseña.");
      return;
    }

    try {
      setAuthLoading(true);
      await sendPasswordResetEmail(auth, email);
      setAuthInfo("Si el correo es válido, te enviamos un email para restablecer tu contraseña.");
    } catch (error) {
      console.error(error);
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSelectedCategoryFilter("Todas");
      setActiveTab("Dashboard");
      setCloudError("");
      setAuthView("login");
      setAuthForm({
        nombre: "",
        email: "",
        password: "",
        repeatPassword: "",
      });
    } catch (error) {
      console.error(error);
      setCloudError("No se pudo cerrar la sesión.");
    }
  };

  const isTinyPhone = windowWidth < 480;
  const isPhone = windowWidth < 720;
  const isTablet = windowWidth < 1100;
  const isLaptop = windowWidth < 1360;

  const headerStyle = {
    ...styles.header,
    gridTemplateColumns: "1fr",
    alignItems: "stretch",
    gap: isPhone ? 18 : 28,
  };

  const headerRightStyle = {
    ...styles.headerRight,
    display: "grid",
    gridTemplateColumns: isTablet ? "1fr" : "minmax(300px, 380px) minmax(0, 1fr)",
    alignItems: "center",
    width: "100%",
    gap: isPhone ? 12 : 24,
    minWidth: 0,
  };

  const userCardStyle = {
    ...styles.userCard,
    width: "100%",
    maxWidth: isTablet ? "100%" : 380,
    flexShrink: 0,
    justifySelf: "start",
  };

  const headerControlsGroupStyle = {
    display: "grid",
    gridTemplateColumns: isPhone ? "1fr" : "minmax(190px, 210px) auto",
    alignItems: "center",
    justifyContent: isTablet ? "stretch" : "end",
    justifySelf: isTablet ? "stretch" : "end",
    gap: isPhone ? 12 : 18,
    width: "100%",
    minWidth: 0,
  };

  const yearBoxStyle = {
    ...styles.yearBox,
    width: "100%",
    minWidth: 0,
    maxWidth: isPhone ? "100%" : 210,
    minHeight: isPhone ? 76 : 78,
    padding: isPhone ? 12 : "12px 14px",
  };

  const heroBottomStackStyle = {
    display: "grid",
    gap: isPhone ? 10 : 12,
    marginTop: 14,
  };

  const topBarActionsStyle = {
    ...styles.topBarActions,
    justifyContent: "flex-start",
    alignItems: "center",
    minHeight: "auto",
    gap: isPhone ? 10 : 16,
    flexWrap: isTablet ? "wrap" : "nowrap",
    minWidth: 0,
  };

  const titleStyle = {
    ...styles.title,
    fontSize: isTinyPhone ? 34 : isPhone ? 42 : isTablet ? 50 : isLaptop ? 60 : 68,
    textAlign: "left",
    maxWidth: isTablet ? "100%" : 980,
  };

  const subtitleStyle = {
    ...styles.subtitle,
    maxWidth: isTablet ? "100%" : 860,
    textAlign: "left",
  };

  const tabsWrapStyle = {
    ...styles.tabsWrap,
    flexWrap: isPhone ? "nowrap" : "wrap",
    overflowX: isPhone ? "auto" : "visible",
    paddingBottom: isPhone ? 4 : 0,
    marginBottom: 24,
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  };

  const dashboardGrid = {
    ...styles.dashboardGrid,
    gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.78fr) minmax(340px, 0.82fr)",
    alignItems: "start",
  };
  const monthGrid = {
    ...styles.monthGrid,
    gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.65fr) minmax(340px, 0.95fr)",
  };
  const chartsGrid = {
    ...styles.chartsGrid,
    gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr",
  };
  const statsGrid = {
    ...styles.statsGrid,
    gridTemplateColumns: isPhone
      ? "1fr"
      : isTablet
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(4, minmax(0, 1fr))",
  };
  const summaryCardsGrid = {
    ...styles.summaryCardsGrid,
    gridTemplateColumns: isTinyPhone
      ? "1fr"
      : isTablet
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(3, minmax(0, 1fr))",
  };
  const monthMetaGrid = {
    ...styles.monthMetaGrid,
    gridTemplateColumns: isPhone ? "1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
  };
  const categoryAnalyticsGrid = {
    ...styles.categoryAnalyticsGrid,
    gridTemplateColumns: isTablet ? "1fr" : "minmax(320px, 0.9fr) minmax(0, 1.1fr)",
  };
  const dashboardFilterGrid = {
    ...styles.dashboardFilterGrid,
    gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr",
  };

  const authTabsStyle = {
    ...styles.authTabs,
    gridTemplateColumns: isPhone ? "1fr" : "repeat(3, minmax(0, 1fr))",
  };

  const updateMonth = (month, updater) => {
    setData((prev) => ({
      ...prev,
      [month]: updater(prev[month]),
    }));
  };

  const addEntry = (month, type, entryData) => {
    updateMonth(month, (prev) => ({
      ...prev,
      [type]: [
        ...prev[type],
        {
          id: crypto.randomUUID(),
          descripcion: entryData.descripcion,
          monto: entryData.monto,
          moneda: entryData.moneda,
          categoria: entryData.categoria || DEFAULT_CATEGORY,
        },
      ],
    }));
  };

  const deleteEntry = (month, type, id) => {
    updateMonth(month, (prev) => ({
      ...prev,
      [type]: prev[type].filter((item) => item.id !== id),
    }));
  };

  const setInitialSavings = (month, currency, value) => {
    updateMonth(month, (prev) => ({
      ...prev,
      [currency === "ARS" ? "ahorroInicialARS" : "ahorroInicialUSD"]:
        Number(value) || 0,
    }));
  };

  const monthSummary = useMemo(() => {
    const summary = {};
    let runningARS = 0;
    let runningUSD = 0;

    MONTHS.forEach((month, index) => {
      const monthData = data[month] || emptyMonth();

      const ingresosARS = monthData.ingresos
        .filter((item) => item.moneda === "ARS")
        .reduce((acc, item) => acc + (Number(item.monto) || 0), 0);

      const ingresosUSD = monthData.ingresos
        .filter((item) => item.moneda === "USD")
        .reduce((acc, item) => acc + (Number(item.monto) || 0), 0);

      const gastosARS = monthData.gastos
        .filter((item) => item.moneda === "ARS")
        .reduce((acc, item) => acc + (Number(item.monto) || 0), 0);

      const gastosUSD = monthData.gastos
        .filter((item) => item.moneda === "USD")
        .reduce((acc, item) => acc + (Number(item.monto) || 0), 0);

      const ahorroBaseARS =
        index === 0 ? Number(monthData.ahorroInicialARS) || 0 : runningARS;
      const ahorroBaseUSD =
        index === 0 ? Number(monthData.ahorroInicialUSD) || 0 : runningUSD;

      const balanceARS = ingresosARS - gastosARS;
      const balanceUSD = ingresosUSD - gastosUSD;
      const ahorroFinalARS = ahorroBaseARS + balanceARS;
      const ahorroFinalUSD = ahorroBaseUSD + balanceUSD;

      runningARS = ahorroFinalARS;
      runningUSD = ahorroFinalUSD;

      summary[month] = {
        ingresosARS,
        ingresosUSD,
        gastosARS,
        gastosUSD,
        ahorroBaseARS,
        ahorroBaseUSD,
        balanceARS,
        balanceUSD,
        ahorroFinalARS,
        ahorroFinalUSD,
        movimientos: monthData.ingresos.length + monthData.gastos.length,
        cantidadIngresos: monthData.ingresos.length,
        cantidadGastos: monthData.gastos.length,
      };
    });

    return summary;
  }, [data]);

  const totals = useMemo(() => {
    return MONTHS.reduce(
      (acc, month) => {
        acc.ingresosARS += monthSummary[month]?.ingresosARS || 0;
        acc.ingresosUSD += monthSummary[month]?.ingresosUSD || 0;
        acc.gastosARS += monthSummary[month]?.gastosARS || 0;
        acc.gastosUSD += monthSummary[month]?.gastosUSD || 0;
        acc.balanceARS += monthSummary[month]?.balanceARS || 0;
        acc.balanceUSD += monthSummary[month]?.balanceUSD || 0;
        acc.movimientos += monthSummary[month]?.movimientos || 0;
        return acc;
      },
      {
        ingresosARS: 0,
        ingresosUSD: 0,
        gastosARS: 0,
        gastosUSD: 0,
        balanceARS: 0,
        balanceUSD: 0,
        movimientos: 0,
      }
    );
  }, [monthSummary]);

  const currentMonthSummary = monthSummary[currentMonth] || {
    ingresosARS: 0,
    ingresosUSD: 0,
    gastosARS: 0,
    gastosUSD: 0,
    ahorroBaseARS: 0,
    ahorroBaseUSD: 0,
    balanceARS: 0,
    balanceUSD: 0,
    ahorroFinalARS: 0,
    ahorroFinalUSD: 0,
    movimientos: 0,
    cantidadIngresos: 0,
    cantidadGastos: 0,
  };

  const finalMonth = MONTHS[MONTHS.length - 1];
  const finalARS = monthSummary[finalMonth]?.ahorroFinalARS || 0;
  const finalUSD = monthSummary[finalMonth]?.ahorroFinalUSD || 0;

  const bestARSMonth = useMemo(() => {
    return MONTHS.reduce(
      (best, month) =>
        monthSummary[month]?.balanceARS > best.value
          ? { month, value: monthSummary[month]?.balanceARS || 0 }
          : best,
      { month: MONTHS[0], value: monthSummary[MONTHS[0]]?.balanceARS || 0 }
    );
  }, [monthSummary]);

  const worstARSMonth = useMemo(() => {
    return MONTHS.reduce(
      (worst, month) =>
        monthSummary[month]?.balanceARS < worst.value
          ? { month, value: monthSummary[month]?.balanceARS || 0 }
          : worst,
      { month: MONTHS[0], value: monthSummary[MONTHS[0]]?.balanceARS || 0 }
    );
  }, [monthSummary]);

  const bestUSDMonth = useMemo(() => {
    return MONTHS.reduce(
      (best, month) =>
        monthSummary[month]?.ahorroFinalUSD > best.value
          ? { month, value: monthSummary[month]?.ahorroFinalUSD || 0 }
          : best,
      { month: MONTHS[0], value: monthSummary[MONTHS[0]]?.ahorroFinalUSD || 0 }
    );
  }, [monthSummary]);

  const avgBalanceARS = totals.balanceARS / 12;
  const annualSavingsRate = totals.ingresosARS > 0 ? (totals.balanceARS / totals.ingresosARS) * 100 : 0;
  const currentMonthSavingsRate = currentMonthSummary.ingresosARS > 0 ? (currentMonthSummary.balanceARS / currentMonthSummary.ingresosARS) * 100 : 0;

  const chartData = useMemo(() => {
    return MONTHS.map((month) => ({
      label: month.slice(0, 3),
      ahorroARS: monthSummary[month]?.ahorroFinalARS || 0,
      ahorroUSD: monthSummary[month]?.ahorroFinalUSD || 0,
      balanceARS: monthSummary[month]?.balanceARS || 0,
    }));
  }, [monthSummary]);

  const categoryExpenseTotals = useMemo(() => {
    const base = CATEGORIES.reduce((acc, category) => {
      acc[category] = { category, ars: 0, usd: 0, count: 0 };
      return acc;
    }, {});

    MONTHS.forEach((month) => {
      const monthData = data[month] || emptyMonth();
      monthData.gastos.forEach((item) => {
        const category = item.categoria || DEFAULT_CATEGORY;
        if (!base[category]) {
          base[category] = { category, ars: 0, usd: 0, count: 0 };
        }

        if (item.moneda === "USD") {
          base[category].usd += Number(item.monto) || 0;
        } else {
          base[category].ars += Number(item.monto) || 0;
        }

        base[category].count += 1;
      });
    });

    return Object.values(base).sort((a, b) => {
      if (b.ars !== a.ars) return b.ars - a.ars;
      if (b.usd !== a.usd) return b.usd - a.usd;
      return b.count - a.count;
    });
  }, [data]);

  const visibleCategoryRows = useMemo(() => {
    const rows = selectedCategoryFilter === "Todas"
      ? categoryExpenseTotals
      : categoryExpenseTotals.filter((row) => row.category === selectedCategoryFilter);

    return rows.filter((row) => row.ars > 0 || row.usd > 0 || row.count > 0);
  }, [categoryExpenseTotals, selectedCategoryFilter]);

  const selectedCategorySummary = useMemo(() => {
    return visibleCategoryRows.reduce(
      (acc, row) => {
        acc.ars += row.ars;
        acc.usd += row.usd;
        acc.count += row.count;
        return acc;
      },
      { ars: 0, usd: 0, count: 0 }
    );
  }, [visibleCategoryRows]);

  const topCategoryRows = useMemo(() => visibleCategoryRows.slice(0, 6), [visibleCategoryRows]);

  const selectedCategoryLabel =
    selectedCategoryFilter === "Todas" ? "Todas las categorías" : selectedCategoryFilter;

  const selectedMonthName = activeTab === "Dashboard" ? currentMonth : activeTab;
  const selectedMonth = data[selectedMonthName] || emptyMonth();
  const selectedSummary = monthSummary[selectedMonthName] || {
    ingresosARS: 0,
    ingresosUSD: 0,
    gastosARS: 0,
    gastosUSD: 0,
    ahorroBaseARS: 0,
    ahorroBaseUSD: 0,
    balanceARS: 0,
    balanceUSD: 0,
    ahorroFinalARS: 0,
    ahorroFinalUSD: 0,
    movimientos: 0,
    cantidadIngresos: 0,
    cantidadGastos: 0,
  };

  const filteredIngresos = useMemo(() => {
    if (selectedCategoryFilter === "Todas") return selectedMonth.ingresos;
    return selectedMonth.ingresos.filter((entry) => (entry.categoria || DEFAULT_CATEGORY) === selectedCategoryFilter);
  }, [selectedMonth.ingresos, selectedCategoryFilter]);

  const filteredGastos = useMemo(() => {
    if (selectedCategoryFilter === "Todas") return selectedMonth.gastos;
    return selectedMonth.gastos.filter((entry) => (entry.categoria || DEFAULT_CATEGORY) === selectedCategoryFilter);
  }, [selectedMonth.gastos, selectedCategoryFilter]);


  if (!authReady) {
    return <LoadingScreen message="Preparando acceso..." />;
  }

  if (!currentUser) {
    return (
      <AuthScreen
        authView={authView}
        setAuthView={setAuthView}
        authForm={authForm}
        updateAuthField={updateAuthField}
        handleLogin={handleLogin}
        handleRegister={handleRegister}
        handlePasswordReset={handlePasswordReset}
        authLoading={authLoading}
        authError={authError}
        authInfo={authInfo}
        windowWidth={windowWidth}
      />
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.glowTop} />
      <div style={styles.glowBottom} />

      <div style={styles.container}>
        <div style={headerStyle}>
          <div style={styles.titleBlock}>
            <h1 style={titleStyle}>Control de Gastos e Ingresos</h1>
            <p style={subtitleStyle}>
              Seguimiento anual con ahorro acumulado, balance mensual y evolución en dólares.
            </p>
          </div>

          <div style={headerRightStyle}>
            <div style={userCardStyle}>
              <div style={styles.userMetaLabel}>Sesión activa</div>
              <div style={styles.userName}>{currentUser.displayName || "Usuario"}</div>
              <div style={styles.userEmail}>{currentUser.email}</div>
            </div>

            <div style={headerControlsGroupStyle}>
              <div style={yearBoxStyle}>
                <label style={styles.label}>Año</label>
                <select
                  style={styles.input}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                >
                  {Array.from({ length: 11 }, (_, i) => String(currentYear - 5 + i)).map((optionYear) => (
                    <option key={optionYear} value={optionYear}>
                      {optionYear}
                    </option>
                  ))}
                </select>
              </div>

              <div style={topBarActionsStyle}>
                <div style={styles.statusInline}>
                  <div style={styles.statusInlineLabel}>Estado</div>
                  <div style={styles.statusPill}>
                    <span style={styles.statusDot} />
                    {cloudStatus}
                  </div>
                </div>

                <button style={styles.logoutButton} onClick={handleLogout}>
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </div>

        {cloudError ? <div style={styles.errorBanner}>{cloudError}</div> : null}

        <div style={tabsWrapStyle}>
          <button
            onClick={() => setActiveTab("Dashboard")}
            style={{
              ...styles.tab,
              ...(activeTab === "Dashboard" ? styles.activeTab : {}),
            }}
          >
            Dashboard
          </button>

          {MONTHS.map((month) => (
            <button
              key={month}
              onClick={() => setActiveTab(month)}
              style={{
                ...styles.tab,
                ...(activeTab === month ? styles.activeTab : {}),
              }}
            >
              {month}
            </button>
          ))}
        </div>

        {activeTab === "Dashboard" ? (
          <>
            <div style={dashboardGrid}>
              <div style={{ ...styles.card, ...styles.heroCard }}>
                <div style={styles.heroTopRow}>
                  <div>
                    <div style={styles.heroLabel}>Ahorro acumulado</div>
                    <div style={styles.heroAmount}>$ {formatARS(finalARS)}</div>
                  </div>
                  <div style={styles.heroBadge}>USD: US$ {formatUSD(finalUSD)}</div>
                </div>

                <div style={heroBottomStackStyle}>
                  <div style={styles.progressBlock}>
                    <div style={styles.progressHeader}>
                      <span style={styles.progressLabel}>Tasa de ahorro anual ARS</span>
                      <strong style={styles.progressValue}>{formatPercent(annualSavingsRate)}</strong>
                    </div>
                    <ProgressBar value={annualSavingsRate} max={100} color="#4ef0a8" />
                  </div>

                  <div style={summaryCardsGrid}>
                    <MiniPanel
                      title="Mes actual"
                      mainValue={`$ ${formatARS(currentMonthSummary.balanceARS)}`}
                      secondary={`${currentMonth}`}
                      tone={currentMonthSummary.balanceARS >= 0 ? "green" : "red"}
                    />
                    <MiniPanel
                      title="Mejor mes ARS"
                      mainValue={`$ ${formatARS(bestARSMonth.value)}`}
                      secondary={bestARSMonth.month}
                      tone="green"
                    />
                    <MiniPanel
                      title="Peor mes ARS"
                      mainValue={`$ ${formatARS(worstARSMonth.value)}`}
                      secondary={worstARSMonth.month}
                      tone="red"
                    />
                  </div>
                </div>
              </div>

              <div style={{ ...styles.card, ...styles.monthSnapshotCard }}>
                <div style={styles.cardTopRow}>
                  <h2 style={styles.cardTitle}>Foto de {currentMonth}</h2>
                  <span style={styles.snapshotChip}>Mes actual</span>
                </div>
                <SummaryRow label="Ingresos ARS" value={`$ ${formatARS(currentMonthSummary.ingresosARS)}`} />
                <SummaryRow label="Gastos ARS" value={`$ ${formatARS(currentMonthSummary.gastosARS)}`} />
                <SummaryRow label="Balance ARS" value={`$ ${formatARS(currentMonthSummary.balanceARS)}`} strongTone={currentMonthSummary.balanceARS >= 0 ? "#6df0bd" : "#ff8c99"} />
                <SummaryRow label="Movimientos" value={`${currentMonthSummary.movimientos}`} />
                <div style={styles.divider} />
                <SummaryRow label="Ahorro final USD" value={`US$ ${formatUSD(currentMonthSummary.ahorroFinalUSD)}`} strongTone="#89d5ff" />
                <SummaryRow label="Tasa de ahorro del mes" value={formatPercent(currentMonthSavingsRate)} strongTone="#f7d76d" />
                <div style={{ marginTop: 12 }}>
                  <ProgressBar value={currentMonthSavingsRate} max={100} color="#f7d76d" />
                </div>
              </div>
            </div>

            <div style={statsGrid}>
              <StatCard title="Ingresos ARS" value={`$ ${formatARS(totals.ingresosARS)}`} accent="#4ef0a8" />
              <StatCard title="Gastos ARS" value={`$ ${formatARS(totals.gastosARS)}`} accent="#ff7a8c" />
              <StatCard title="Balance anual ARS" value={`$ ${formatARS(totals.balanceARS)}`} accent="#88c8ff" />
              <StatCard title="Ahorro final USD" value={`US$ ${formatUSD(finalUSD)}`} accent="#f7d76d" />
            </div>

            <div style={dashboardFilterGrid}>
              <div style={styles.card}>
                <div style={styles.cardTopRow}>
                  <h2 style={styles.cardTitle}>Filtro por categoría</h2>
                  <span style={styles.snapshotChip}>Vista dinámica</span>
                </div>

                <label style={styles.label}>Categoría visible</label>
                <select
                  style={styles.input}
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                >
                  <option value="Todas">Todas</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <div style={{ marginTop: 16 }}>
                  <SummaryRow label="Gastos ARS filtrados" value={`$ ${formatARS(selectedCategorySummary.ars)}`} strongTone="#ff8c99" />
                  <SummaryRow label="Gastos USD filtrados" value={`US$ ${formatUSD(selectedCategorySummary.usd)}`} strongTone="#89d5ff" />
                  <SummaryRow label="Movimientos filtrados" value={`${selectedCategorySummary.count}`} />
                </div>
              </div>

              <div style={styles.card}>
                <div style={styles.cardTopRow}>
                  <h2 style={styles.cardTitle}>Totales por categoría</h2>
                  <span style={styles.snapshotChip}>{selectedCategoryLabel}</span>
                </div>

                {topCategoryRows.length === 0 ? (
                  <div style={styles.emptyBox}>Todavía no hay gastos cargados para esa categoría.</div>
                ) : (
                  <div style={styles.categoryList}>
                    {topCategoryRows.map((row) => (
                      <div key={row.category} style={styles.categoryRow}>
                        <div style={styles.categoryRowLeft}>
                          <span style={styles.categoryName}>{row.category}</span>
                          <span style={styles.categoryCount}>{row.count} mov.</span>
                        </div>
                        <div style={styles.categoryRowRight}>
                          <span style={styles.categoryValueARS}>$ {formatARS(row.ars)}</span>
                          <span style={styles.categoryValueUSD}>US$ {formatUSD(row.usd)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={chartsGrid}>
              <div style={styles.card}>
                <div style={styles.cardTopRow}>
                  <h2 style={styles.cardTitle}>Variación mes a mes en ARS</h2>
                  <span style={styles.chartLegendPill}>Balance mensual</span>
                </div>
                <p style={styles.chartDescription}>
                  Verde suma, rojo resta. Esto muestra el resultado de cada mes antes de acumularlo.
                </p>
                <BarChart data={chartData} />
              </div>

              <div style={styles.card}>
                <div style={styles.cardTopRow}>
                  <h2 style={styles.cardTitle}>Cómo crecen tus dólares</h2>
                  <span style={styles.chartLegendPillBlue}>Ahorro acumulado USD</span>
                </div>
                <p style={styles.chartDescription}>
                  Acá ves si tus dólares vienen creciendo de forma sostenida o si hubo meses de retroceso.
                </p>
                <LineChart data={chartData} />
              </div>
            </div>

            <div style={categoryAnalyticsGrid}>
              <div style={styles.card}>
                <div style={styles.cardTopRow}>
                  <h2 style={styles.cardTitle}>Gastos por categoría</h2>
                  <span style={styles.chartLegendPillBlue}>ARS anual</span>
                </div>
                <p style={styles.chartDescription}>
                  El gráfico toma los gastos acumulados en pesos por categoría del año seleccionado.
                </p>
                <CategoryDonutChart data={topCategoryRows} />
              </div>

              <div style={styles.card}>
                <div style={styles.cardTopRow}>
                  <h2 style={styles.cardTitle}>Detalle rápido</h2>
                  <span style={styles.snapshotChip}>{selectedCategoryLabel}</span>
                </div>

                {topCategoryRows.length === 0 ? (
                  <div style={styles.emptyBox}>No hay datos suficientes para mostrar el gráfico.</div>
                ) : (
                  <div style={styles.categoryLegendList}>
                    {topCategoryRows.map((row, index) => (
                      <div key={row.category} style={styles.categoryLegendRow}>
                        <div style={styles.categoryLegendLeft}>
                          <span
                            style={{
                              ...styles.legendDot,
                              background: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                            }}
                          />
                          <span style={styles.categoryLegendName}>{row.category}</span>
                        </div>
                        <strong style={styles.categoryLegendValue}>$ {formatARS(row.ars)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTopRow}>
                <h2 style={styles.cardTitle}>Resumen por mes</h2>
                <span style={styles.snapshotChip}>Vista anual</span>
              </div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Mes</th>
                      <th style={styles.th}>Ingresos ARS</th>
                      <th style={styles.th}>Gastos ARS</th>
                      <th style={styles.th}>Balance ARS</th>
                      <th style={styles.th}>Ahorro ARS</th>
                      <th style={styles.th}>Ingresos USD</th>
                      <th style={styles.th}>Gastos USD</th>
                      <th style={styles.th}>Ahorro USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHS.map((month) => (
                      <tr key={month}>
                        <td style={styles.td}>{month}</td>
                        <td style={styles.td}>$ {formatARS(monthSummary[month]?.ingresosARS || 0)}</td>
                        <td style={styles.td}>$ {formatARS(monthSummary[month]?.gastosARS || 0)}</td>
                        <td style={{ ...styles.td, color: (monthSummary[month]?.balanceARS || 0) >= 0 ? "#6df0bd" : "#ff8c99" }}>
                          $ {formatARS(monthSummary[month]?.balanceARS || 0)}
                        </td>
                        <td style={styles.td}>$ {formatARS(monthSummary[month]?.ahorroFinalARS || 0)}</td>
                        <td style={styles.td}>US$ {formatUSD(monthSummary[month]?.ingresosUSD || 0)}</td>
                        <td style={styles.td}>US$ {formatUSD(monthSummary[month]?.gastosUSD || 0)}</td>
                        <td style={styles.td}>US$ {formatUSD(monthSummary[month]?.ahorroFinalUSD || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div style={monthGrid}>
            <div>
              <div style={monthMetaGrid}>
                <InfoCard title="Movimientos" value={`${selectedSummary.movimientos}`} subtitle="Total cargado en el mes" compact />
                <InfoCard title="Ingresos visibles" value={`${filteredIngresos.length}`} subtitle={`Filtro: ${selectedCategoryLabel}`} compact />
                <InfoCard title="Gastos visibles" value={`${filteredGastos.length}`} subtitle={`Filtro: ${selectedCategoryLabel}`} compact />
              </div>

              <div style={{ height: 18 }} />

              <EntrySection
                title="Ingresos"
                entries={filteredIngresos}
                categoryFilter={selectedCategoryFilter}
                onAdd={(entry) => addEntry(selectedMonthName, "ingresos", entry)}
                onDelete={(id) => deleteEntry(selectedMonthName, "ingresos", id)}
              />

              <div style={{ height: 18 }} />

              <EntrySection
                title="Gastos"
                entries={filteredGastos}
                categoryFilter={selectedCategoryFilter}
                onAdd={(entry) => addEntry(selectedMonthName, "gastos", entry)}
                onDelete={(id) => deleteEntry(selectedMonthName, "gastos", id)}
              />
            </div>

            <div>
              <div style={styles.card}>
                <div style={styles.cardTopRow}>
                  <h2 style={styles.cardTitle}>Resumen de {selectedMonthName}</h2>
                  <span
                    style={{
                      ...styles.snapshotChip,
                      color: selectedSummary.balanceARS >= 0 ? "#8cf1c6" : "#ff93a0",
                      borderColor: selectedSummary.balanceARS >= 0 ? "rgba(92, 247, 183, 0.28)" : "rgba(255, 122, 140, 0.28)",
                      background: selectedSummary.balanceARS >= 0 ? "rgba(78, 240, 168, 0.11)" : "rgba(255, 122, 140, 0.11)",
                    }}
                  >
                    Balance: $ {formatARS(selectedSummary.balanceARS)}
                  </span>
                </div>
                <SummaryRow label="Ahorro inicial ARS" value={`$ ${formatARS(selectedSummary.ahorroBaseARS)}`} />
                <SummaryRow label="Ingresos ARS" value={`$ ${formatARS(selectedSummary.ingresosARS)}`} />
                <SummaryRow label="Gastos ARS" value={`$ ${formatARS(selectedSummary.gastosARS)}`} />
                <SummaryRow label="Ahorro final ARS" value={`$ ${formatARS(selectedSummary.ahorroFinalARS)}`} strongTone="#6df0bd" />
                <div style={styles.divider} />
                <SummaryRow label="Ahorro inicial USD" value={`US$ ${formatUSD(selectedSummary.ahorroBaseUSD)}`} />
                <SummaryRow label="Ingresos USD" value={`US$ ${formatUSD(selectedSummary.ingresosUSD)}`} />
                <SummaryRow label="Gastos USD" value={`US$ ${formatUSD(selectedSummary.gastosUSD)}`} />
                <SummaryRow label="Ahorro final USD" value={`US$ ${formatUSD(selectedSummary.ahorroFinalUSD)}`} strongTone="#89d5ff" />
              </div>

              <div style={{ height: 18 }} />

              <div style={styles.card}>
                <h2 style={styles.cardTitle}>Ahorro inicial</h2>
                <p style={styles.note}>
                  Esto impacta de verdad en enero. Después, cada mes arrastra el ahorro del anterior.
                </p>

                <label style={styles.label}>Pesos</label>
                <input
                  type="number"
                  style={styles.input}
                  value={selectedMonth.ahorroInicialARS}
                  onChange={(e) =>
                    setInitialSavings(selectedMonthName, "ARS", e.target.value)
                  }
                />

                <div style={{ height: 12 }} />

                <label style={styles.label}>Dólares</label>
                <input
                  type="number"
                  style={styles.input}
                  value={selectedMonth.ahorroInicialUSD}
                  onChange={(e) =>
                    setInitialSavings(selectedMonthName, "USD", e.target.value)
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function LoadingScreen({ message }) {
  return (
    <div style={styles.authPage}>
      <div style={{ ...styles.authCard, ...styles.loadingCard }}>
        <div style={styles.loadingSpinner} />
        <h2 style={styles.authTitle}>{message}</h2>
      </div>
    </div>
  );
}

function AuthScreen({
  authView,
  setAuthView,
  authForm,
  updateAuthField,
  handleLogin,
  handleRegister,
  handlePasswordReset,
  authLoading,
  authError,
  authInfo,
  windowWidth,
}) {
  const authTabsStyle = {
    ...styles.authTabs,
    gridTemplateColumns: windowWidth < 720 ? "1fr" : "repeat(3, minmax(0, 1fr))",
  };
  const submitAction =
    authView === "register"
      ? handleRegister
      : authView === "forgot"
      ? handlePasswordReset
      : handleLogin;

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitAction();
    }
  };

  return (
    <div style={styles.authPage}>
      <div style={styles.glowTop} />
      <div style={styles.glowBottom} />

      <div style={styles.authShell}>
        <div style={styles.authCard}>
          <div style={styles.authHeader}>
            <div style={styles.authEyebrow}>ACCESO SEGURO</div>
            <h1 style={styles.authTitle}>Control de gastos personal</h1>
            <p style={styles.authSubtitle}>
              Registrate para guardar tu seguimiento y entrar siempre a tu propia información.
            </p>
          </div>

          <div style={authTabsStyle}>
            <button
              style={{
                ...styles.authTab,
                ...(authView === "login" ? styles.authTabActive : {}),
              }}
              onClick={() => setAuthView("login")}
            >
              Iniciar sesión
            </button>
            <button
              style={{
                ...styles.authTab,
                ...(authView === "register" ? styles.authTabActive : {}),
              }}
              onClick={() => setAuthView("register")}
            >
              Registrarse
            </button>
            <button
              style={{
                ...styles.authTab,
                ...(authView === "forgot" ? styles.authTabActive : {}),
              }}
              onClick={() => setAuthView("forgot")}
            >
              Olvidé mi contraseña
            </button>
          </div>

          {authError ? <div style={styles.authErrorBox}>{authError}</div> : null}
          {authInfo ? <div style={styles.authInfoBox}>{authInfo}</div> : null}

          {authView === "forgot" ? (
            <div style={styles.authHelperBox}>
              Ingresás tu email, Firebase te manda un correo con un enlace de recuperación, abrís ese mail, tocás el link y elegís una nueva contraseña.
            </div>
          ) : null}

          <div style={styles.authFormGrid} onKeyDown={handleKeyDown}>
            {authView === "register" ? (
              <div>
                <label style={styles.label}>Nombre</label>
                <input
                  style={styles.input}
                  value={authForm.nombre}
                  onChange={(e) => updateAuthField("nombre", e.target.value)}
                  placeholder="Tu nombre"
                />
              </div>
            ) : null}

            <div>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                style={styles.input}
                value={authForm.email}
                onChange={(e) => updateAuthField("email", e.target.value)}
                placeholder="tu@email.com"
              />
            </div>

            {authView !== "forgot" ? (
              <div>
                <label style={styles.label}>Contraseña</label>
                <input
                  type="password"
                  style={styles.input}
                  value={authForm.password}
                  onChange={(e) => updateAuthField("password", e.target.value)}
                  placeholder="********"
                />
              </div>
            ) : null}

            {authView === "register" ? (
              <div>
                <label style={styles.label}>Repetir contraseña</label>
                <input
                  type="password"
                  style={styles.input}
                  value={authForm.repeatPassword}
                  onChange={(e) => updateAuthField("repeatPassword", e.target.value)}
                  placeholder="********"
                />
              </div>
            ) : null}
          </div>

          <button style={styles.authPrimaryButton} onClick={submitAction} disabled={authLoading}>
            {authLoading
              ? "Procesando..."
              : authView === "register"
              ? "Crear cuenta"
              : authView === "forgot"
              ? "Enviar mail de recuperación"
              : "Entrar"}
          </button>

          <div style={styles.authBottomLinks}>
            {authView === "login" ? (
              <>
                <button style={styles.authLinkButton} onClick={() => setAuthView("register")}>
                  No tengo cuenta
                </button>
                <button style={styles.authLinkButton} onClick={() => setAuthView("forgot")}>
                  Recuperar contraseña
                </button>
              </>
            ) : authView === "register" ? (
              <button style={styles.authLinkButton} onClick={() => setAuthView("login")}>
                Ya tengo cuenta
              </button>
            ) : (
              <button style={styles.authLinkButton} onClick={() => setAuthView("login")}>
                Volver al login
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getAuthErrorMessage(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "Ese email ya está registrado.";
    case "auth/invalid-email":
      return "El email no es válido.";
    case "auth/missing-password":
      return "Ingresá una contraseña.";
    case "auth/weak-password":
      return "La contraseña es demasiado débil.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Email o contraseña incorrectos.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Probá de nuevo más tarde.";
    default:
      return "Ocurrió un error con la autenticación.";
  }
}


function EntrySection({ title, entries, categoryFilter, onAdd, onDelete }) {
  const [draft, setDraft] = useState({
    descripcion: "",
    monto: "",
    moneda: "ARS",
    categoria: DEFAULT_CATEGORY,
  });

  const saveEntry = () => {
    if (!draft.descripcion.trim() || draft.monto === "") return;

    onAdd({
      descripcion: draft.descripcion.trim(),
      monto: Number(draft.monto) || 0,
      moneda: draft.moneda,
      categoria: draft.categoria,
    });

    setDraft({ descripcion: "", monto: "", moneda: draft.moneda, categoria: draft.categoria });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEntry();
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.cardTitle}>{title}</h2>
      </div>

      <div style={styles.quickEntryBox}>
        <input
          style={{ ...styles.input, ...styles.quickInputText }}
          value={draft.descripcion}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, descripcion: e.target.value }))
          }
          onKeyDown={handleKeyDown}
          placeholder="Motivo"
        />

        <input
          type="number"
          style={{ ...styles.input, ...styles.quickInputAmount }}
          value={draft.monto}
          onChange={(e) => setDraft((prev) => ({ ...prev, monto: e.target.value }))}
          onKeyDown={handleKeyDown}
          placeholder="Valor"
        />

        <select
          style={{ ...styles.input, ...styles.quickInputCurrency }}
          value={draft.moneda}
          onChange={(e) => setDraft((prev) => ({ ...prev, moneda: e.target.value }))}
          onKeyDown={handleKeyDown}
        >
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>

        <select
          style={{ ...styles.input, ...styles.quickInputCategory }}
          value={draft.categoria}
          onChange={(e) => setDraft((prev) => ({ ...prev, categoria: e.target.value }))}
          onKeyDown={handleKeyDown}
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <p style={styles.enterHint}>Escribís motivo, valor y categoría. Apretás Enter y se guarda.</p>

      {entries.length === 0 ? (
        <div style={styles.emptyBox}>
          {categoryFilter === "Todas"
            ? "Todavía no cargaste nada."
            : `No hay movimientos visibles para ${categoryFilter}.`}
        </div>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} style={styles.simpleRow}>
            <div style={styles.simpleRowLeft}>
              <span style={styles.simpleRowLabel}>{entry.descripcion}</span>
              <div style={styles.categoryBadge}>{entry.categoria || DEFAULT_CATEGORY}</div>
            </div>

            <div style={styles.simpleRowRight}>
              <span style={styles.simpleRowAmount}>
                {entry.moneda === "ARS" ? "$" : "US$"} {entry.moneda === "ARS" ? formatARS(entry.monto) : formatUSD(entry.monto)}
              </span>
              <button style={styles.deleteSquareButton} onClick={() => onDelete(entry.id)}>
                🗑
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function StatCard({ title, value, accent }) {
  return (
    <div style={{ ...styles.card, ...styles.statCard }}>
      <div style={{ ...styles.statAccent, background: accent }} />
      <div style={styles.statTitle}>{title}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function MiniPanel({ title, mainValue, secondary, tone }) {
  const toneStyles = {
    green: { background: "rgba(78, 240, 168, 0.10)", border: "1px solid rgba(78, 240, 168, 0.22)", color: "#8cf1c6" },
    red: { background: "rgba(255, 122, 140, 0.10)", border: "1px solid rgba(255, 122, 140, 0.22)", color: "#ff93a0" },
    blue: { background: "rgba(112, 195, 255, 0.10)", border: "1px solid rgba(112, 195, 255, 0.22)", color: "#9bd7ff" },
    gold: { background: "rgba(247, 215, 109, 0.10)", border: "1px solid rgba(247, 215, 109, 0.22)", color: "#f7d76d" },
  };

  return (
    <div style={{ ...styles.miniPanel, ...(toneStyles[tone] || toneStyles.blue) }}>
      <div style={styles.miniPanelTitle}>{title}</div>
      <div style={styles.miniPanelValue}>{mainValue}</div>
      <div style={styles.miniPanelSecondary}>{secondary}</div>
    </div>
  );
}

function InfoCard({ title, value, subtitle, compact }) {
  return (
    <div style={{ ...styles.card, ...(compact ? styles.infoCardCompact : styles.infoCard) }}>
      <div style={styles.infoCardTitle}>{title}</div>
      <div style={styles.infoCardValue}>{value}</div>
      <div style={styles.infoCardSubtitle}>{subtitle}</div>
    </div>
  );
}

function SummaryRow({ label, value, strongTone }) {
  return (
    <div style={styles.summaryRow}>
      <span>{label}</span>
      <strong style={strongTone ? { color: strongTone } : undefined}>{value}</strong>
    </div>
  );
}

function ProgressBar({ value, max, color }) {
  const safe = Math.max(0, Math.min(value, max));
  const percent = max > 0 ? (safe / max) * 100 : 0;

  return (
    <div style={styles.progressTrack}>
      <div style={{ ...styles.progressFill, width: `${percent}%`, background: color }} />
    </div>
  );
}

function LineChart({ data }) {
  const width = 560;
  const height = 250;
  const paddingX = 26;
  const paddingY = 24;
  const values = data.map((item) => item.ahorroUSD);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const range = maxValue - minValue || 1;

  const points = data
    .map((item, index) => {
      const x = paddingX + (index * (width - paddingX * 2)) / Math.max(data.length - 1, 1);
      const y = height - paddingY - ((item.ahorroUSD - minValue) / range) * (height - paddingY * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.chartSvg}>
        {[0, 1, 2, 3].map((step) => {
          const y = paddingY + (step * (height - paddingY * 2)) / 3;
          return <line key={step} x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="rgba(120, 151, 196, 0.18)" strokeWidth="1" />;
        })}

        <polyline
          fill="none"
          stroke="#72c3ff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />

        {data.map((item, index) => {
          const x = paddingX + (index * (width - paddingX * 2)) / Math.max(data.length - 1, 1);
          const y = height - paddingY - ((item.ahorroUSD - minValue) / range) * (height - paddingY * 2);

          return (
            <g key={item.label}>
              <circle cx={x} cy={y} r="5" fill="#72c3ff" />
              <text x={x} y={height - 6} textAnchor="middle" fill="#94a9cd" fontSize="11">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={styles.chartFooterValue}>Último valor: US$ {formatUSD(data[data.length - 1]?.ahorroUSD || 0)}</div>
    </div>
  );
}

function BarChart({ data }) {
  const width = 560;
  const height = 250;
  const paddingX = 22;
  const paddingY = 20;
  const values = data.map((item) => item.balanceARS);
  const maxAbs = Math.max(...values.map((v) => Math.abs(v)), 1);
  const zeroY = height / 2;
  const innerWidth = width - paddingX * 2;
  const barWidth = innerWidth / Math.max(data.length, 1) - 10;

  return (
    <div style={styles.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.chartSvg}>
        <line x1={paddingX} x2={width - paddingX} y1={zeroY} y2={zeroY} stroke="rgba(148, 169, 205, 0.35)" strokeWidth="1.5" />

        {data.map((item, index) => {
          const scaled = (Math.abs(item.balanceARS) / maxAbs) * (height / 2 - paddingY - 16);
          const x = paddingX + index * (barWidth + 10) + 5;
          const y = item.balanceARS >= 0 ? zeroY - scaled : zeroY;
          const fill = item.balanceARS >= 0 ? "#4ef0a8" : "#ff7a8c";

          return (
            <g key={item.label}>
              <rect x={x} y={y} width={barWidth} height={scaled} rx="8" fill={fill} opacity="0.92" />
              <text x={x + barWidth / 2} y={height - 6} textAnchor="middle" fill="#94a9cd" fontSize="11">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={styles.chartFooterRow}>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#4ef0a8" }} /> Positivo</span>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#ff7a8c" }} /> Negativo</span>
      </div>
    </div>
  );
}

function CategoryDonutChart({ data }) {
  const size = 260;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((acc, item) => acc + item.ars, 0);

  if (!total) {
    return <div style={styles.emptyBox}>No hay gastos en pesos para graficar todavía.</div>;
  }

  let offset = 0;

  return (
    <div style={styles.donutWrap}>
      <svg viewBox={`0 0 ${size} ${size}`} style={styles.donutSvg}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        {data.map((item, index) => {
          const value = item.ars;
          const segment = (value / total) * circumference;
          const circle = (
            <circle
              key={item.category}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${segment} ${circumference - segment}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += segment;
          return circle;
        })}
      </svg>
      <div style={styles.donutCenter}>
        <div style={styles.donutCenterLabel}>Total ARS</div>
        <div style={styles.donutCenterValue}>$ {formatARS(total)}</div>
      </div>
    </div>
  );
}

function formatARS(value) {
  return Number(value || 0).toLocaleString("es-AR");
}

function formatUSD(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

const CATEGORY_COLORS = [
  "#72c3ff",
  "#4ef0a8",
  "#f7d76d",
  "#ff7a8c",
  "#b48bff",
  "#ffb86b",
  "#7cf7f2",
  "#9bd7ff",
];

const styles = {

  authPage: {
    minHeight: "100vh",
    background: "radial-gradient(circle at top left, #12213f 0%, #09111f 38%, #07101c 100%)",
    color: "#e8eef9",
    fontFamily: "Arial, sans-serif",
    padding: 24,
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
  },
  authShell: {
    minHeight: "calc(100vh - 48px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 1,
    width: "100%",
    padding: "20px 0",
  },
  authCard: {
    width: "100%",
    maxWidth: 560,
    background: "rgba(14, 24, 40, 0.88)",
    border: "1px solid rgba(61, 89, 130, 0.42)",
    borderRadius: 28,
    padding: 24,
    boxSizing: "border-box",
    boxShadow: "0 18px 48px rgba(0,0,0,0.22)",
    backdropFilter: "blur(12px)",
  },
  loadingCard: {
    maxWidth: 360,
    textAlign: "center",
  },
  loadingSpinner: {
    width: 54,
    height: 54,
    borderRadius: "50%",
    border: "4px solid rgba(114, 195, 255, 0.18)",
    borderTopColor: "#72c3ff",
    margin: "0 auto 18px auto",
    animation: "spin 1s linear infinite",
  },
  authHeader: {
    marginBottom: 18,
  },
  authEyebrow: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(112, 195, 255, 0.10)",
    border: "1px solid rgba(112, 195, 255, 0.22)",
    color: "#9bd7ff",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 12,
  },
  authTitle: {
    margin: 0,
    fontSize: 32,
    lineHeight: 1.1,
  },
  authSubtitle: {
    margin: "10px 0 0 0",
    color: "#9cb0d1",
    lineHeight: 1.5,
  },
  authTabs: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
    marginBottom: 18,
  },
  authTab: {
    border: "1px solid rgba(56, 82, 120, 0.85)",
    borderRadius: 12,
    background: "rgba(17, 29, 49, 0.78)",
    color: "#d8e4ff",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  },
  authTabActive: {
    background: "linear-gradient(180deg, rgba(35, 65, 103, 0.96) 0%, rgba(25, 47, 77, 0.96) 100%)",
    border: "1px solid rgba(98, 156, 230, 0.85)",
    boxShadow: "0 8px 24px rgba(63, 116, 185, 0.22)",
  },
  authErrorBox: {
    marginBottom: 14,
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(255, 122, 140, 0.11)",
    border: "1px solid rgba(255, 122, 140, 0.28)",
    color: "#ff9baa",
  },
  authInfoBox: {
    marginBottom: 14,
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(78, 240, 168, 0.10)",
    border: "1px solid rgba(78, 240, 168, 0.24)",
    color: "#8cf1c6",
  },
  authHelperBox: {
    marginBottom: 14,
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(114, 195, 255, 0.08)",
    border: "1px solid rgba(114, 195, 255, 0.20)",
    color: "#9cbbe0",
    lineHeight: 1.5,
    fontSize: 14,
  },
  authFormGrid: {
    display: "grid",
    gap: 14,
    marginBottom: 16,
  },
  authPrimaryButton: {
    width: "100%",
    border: "none",
    borderRadius: 14,
    padding: "14px 16px",
    background: "linear-gradient(180deg, #72c3ff 0%, #3b8fe8 100%)",
    color: "#06111f",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 15,
    marginBottom: 14,
  },
  authBottomLinks: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  authLinkButton: {
    border: "none",
    background: "transparent",
    color: "#9bd7ff",
    cursor: "pointer",
    fontWeight: 700,
  },
  userCard: {
    minHeight: 82,
    padding: "16px 18px",
    borderRadius: 22,
    background: "linear-gradient(180deg, rgba(18, 32, 52, 0.88) 0%, rgba(11, 22, 38, 0.92) 100%)",
    border: "1px solid rgba(90, 120, 170, 0.20)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 6,
    boxShadow: "0 18px 34px rgba(3, 9, 20, 0.14)",
  },
  userMetaLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#7fb4ee",
    fontWeight: 700,
    marginBottom: 4,
  },
  userName: {
    fontWeight: 800,
    color: "#eef4ff",
    lineHeight: 1.05,
    fontSize: 18,
  },
  userEmail: {
    fontSize: 12,
    color: "#91a8cb",
    marginTop: 2,
  },
  logoutButton: {
    minHeight: 44,
    borderRadius: 14,
    padding: "0 18px",
    background: "rgba(255, 122, 140, 0.08)",
    border: "1px solid rgba(255, 122, 140, 0.18)",
    color: "#ffb7c2",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
    boxShadow: "none",
    whiteSpace: "nowrap",
  },

  page: {
    minHeight: "100vh",
    width: "100%",
    background: "radial-gradient(circle at top left, #12213f 0%, #09111f 38%, #07101c 100%)",
    color: "#e8eef9",
    fontFamily: "Arial, sans-serif",
    padding: "clamp(10px, 1vw, 18px)",
    boxSizing: "border-box",
    position: "relative",
    overflowX: "clip",
    overflowY: "visible",
  },
  glowTop: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: "50%",
    background: "rgba(72, 145, 255, 0.15)",
    filter: "blur(70px)",
    top: -140,
    right: -120,
    pointerEvents: "none",
  },
  glowBottom: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: "50%",
    background: "rgba(49, 194, 132, 0.11)",
    filter: "blur(80px)",
    bottom: -120,
    left: -100,
    pointerEvents: "none",
  },
  container: {
    width: "100%",
    maxWidth: "none",
    margin: "0 auto",
    position: "relative",
    zIndex: 1,
  },
  header: {
    display: "grid",
    gridTemplateColumns: "1fr",
    alignItems: "center",
    gap: 26,
    marginBottom: 28,
  },
  headerRight: {
    display: "grid",
    gap: 14,
    justifyContent: "start",
    width: "100%",
    minWidth: 0,
  },
  topBarActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    minWidth: 0,
  },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontSize: 52,
    lineHeight: 0.96,
    letterSpacing: "-0.045em",
    maxWidth: 980,
    textWrap: "balance",
  },
  subtitle: {
    margin: 0,
    color: "#94a8cb",
    maxWidth: 860,
    lineHeight: 1.6,
    fontSize: 18,
  },
  yearBox: {
    minWidth: 0,
    minHeight: 82,
    width: "100%",
    background: "linear-gradient(180deg, rgba(10, 19, 33, 0.90) 0%, rgba(8, 15, 27, 0.94) 100%)",
    border: "1px solid rgba(72, 100, 145, 0.18)",
    borderRadius: 22,
    padding: 14,
    boxShadow: "0 18px 34px rgba(4, 8, 18, 0.14)",
    backdropFilter: "blur(10px)",
  },
  statusInline: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 8,
    minWidth: 128,
    flexShrink: 0,
  },
  statusInlineLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#8ca6bf",
    fontWeight: 700,
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 42,
    padding: "0 14px",
    borderRadius: 999,
    background: "rgba(78, 240, 168, 0.08)",
    border: "1px solid rgba(78, 240, 168, 0.18)",
    color: "#87e5bc",
    fontWeight: 800,
    fontSize: 14,
    alignSelf: "flex-start",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#4ef0a8",
    boxShadow: "0 0 0 4px rgba(78, 240, 168, 0.14)",
    flexShrink: 0,
  },
  errorBanner: {
    marginBottom: 18,
    padding: "12px 14px",
    borderRadius: 14,
    background: "rgba(255, 122, 140, 0.11)",
    border: "1px solid rgba(255, 122, 140, 0.28)",
    color: "#ff9baa",
  },
  dashboardGrid: {
    display: "grid",
    gap: 18,
    marginBottom: 18,
    alignItems: "start",
  },
  chartsGrid: {
    display: "grid",
    gap: 18,
    marginBottom: 18,
  },
  summaryCardsGrid: {
    display: "grid",
    gap: 10,
    marginTop: 0,
    marginBottom: 0,
  },
  monthMetaGrid: {
    display: "grid",
    gap: 12,
  },
  categoryAnalyticsGrid: {
    display: "grid",
    gap: 18,
    marginBottom: 18,
  },
  dashboardFilterGrid: {
    display: "grid",
    gap: 18,
    marginBottom: 18,
  },
  tabsWrap: {
    display: "flex",
    gap: 10,
    marginBottom: 28,
    width: "100%",
    alignItems: "center",
  },
  tab: {
    background: "rgba(13, 23, 39, 0.62)",
    color: "#d8e4ff",
    border: "1px solid rgba(56, 82, 120, 0.42)",
    borderRadius: 14,
    padding: "10px 18px",
    cursor: "pointer",
    backdropFilter: "blur(8px)",
    whiteSpace: "nowrap",
    flexShrink: 0,
    fontWeight: 600,
  },
  activeTab: {
    background: "linear-gradient(180deg, rgba(40, 74, 116, 0.88) 0%, rgba(24, 44, 70, 0.94) 100%)",
    border: "1px solid rgba(98, 156, 230, 0.58)",
    boxShadow: "0 8px 20px rgba(63, 116, 185, 0.14)",
  },
  statsGrid: {
    display: "grid",
    gap: 16,
    marginBottom: 18,
  },
  monthGrid: {
    display: "grid",
    gap: 18,
  },
  card: {
    background: "linear-gradient(180deg, rgba(12, 22, 38, 0.80) 0%, rgba(8, 17, 29, 0.84) 100%)",
    border: "1px solid rgba(61, 89, 130, 0.22)",
    borderRadius: 24,
    padding: 22,
    boxSizing: "border-box",
    boxShadow: "0 20px 46px rgba(0,0,0,0.13)",
    backdropFilter: "blur(12px)",
  },
  heroCard: {
    padding: 22,
    background: "linear-gradient(145deg, rgba(18, 34, 58, 0.90) 0%, rgba(10, 21, 39, 0.92) 100%)",
  },
  monthSnapshotCard: {
    minHeight: 100,
  },
  heroTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  heroLabel: {
    color: "#9cb0d1",
    fontSize: 14,
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 64,
    fontWeight: 800,
    letterSpacing: -1.2,
  },
  heroBadge: {
    padding: "10px 14px",
    borderRadius: 999,
    color: "#f8de7d",
    background: "rgba(247, 215, 109, 0.10)",
    border: "1px solid rgba(247, 215, 109, 0.22)",
    fontWeight: 700,
  },
  progressBlock: {
    marginTop: 0,
    padding: 12,
    borderRadius: 16,
    background: "rgba(9, 18, 30, 0.60)",
    border: "1px solid rgba(73, 102, 143, 0.32)",
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  progressLabel: {
    color: "#9cb0d1",
    fontSize: 14,
  },
  progressValue: {
    color: "#e8eef9",
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  cardTitle: {
    margin: 0,
    fontSize: 22,
  },
  cardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  snapshotChip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(112, 195, 255, 0.20)",
    background: "rgba(112, 195, 255, 0.09)",
    color: "#9bd7ff",
    fontSize: 13,
    fontWeight: 700,
  },
  chartLegendPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(78, 240, 168, 0.10)",
    border: "1px solid rgba(78, 240, 168, 0.22)",
    color: "#8cf1c6",
    fontSize: 13,
    fontWeight: 700,
  },
  chartLegendPillBlue: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(114, 195, 255, 0.10)",
    border: "1px solid rgba(114, 195, 255, 0.22)",
    color: "#9bd7ff",
    fontSize: 13,
    fontWeight: 700,
  },
  chartDescription: {
    marginTop: 0,
    marginBottom: 16,
    color: "#95a8ca",
    lineHeight: 1.45,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  miniPanel: {
    borderRadius: 16,
    padding: "12px 14px",
  },
  miniPanelTitle: {
    fontSize: 12,
    marginBottom: 6,
    opacity: 0.9,
  },
  miniPanelValue: {
    fontSize: 22,
    fontWeight: 800,
    marginBottom: 4,
  },
  miniPanelSecondary: {
    fontSize: 12,
    opacity: 0.8,
  },
  infoCard: {
    padding: 18,
  },
  infoCardCompact: {
    padding: 16,
  },
  infoCardTitle: {
    fontSize: 13,
    color: "#9cb0d1",
    marginBottom: 8,
  },
  infoCardValue: {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 6,
  },
  infoCardSubtitle: {
    fontSize: 13,
    color: "#8ea5cb",
    lineHeight: 1.4,
  },
  categoryList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  categoryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(72, 99, 140, 0.34)",
    background: "rgba(8, 15, 27, 0.48)",
  },
  categoryRowLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    minWidth: 0,
  },
  categoryRowRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  categoryName: {
    fontWeight: 700,
    textTransform: "capitalize",
  },
  categoryCount: {
    color: "#8ea5cb",
    fontSize: 12,
  },
  categoryValueARS: {
    color: "#ff9baa",
    fontWeight: 700,
  },
  categoryValueUSD: {
    color: "#89d5ff",
    fontWeight: 700,
  },
  categoryLegendList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 6,
  },
  categoryLegendRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid rgba(61, 89, 130, 0.24)",
  },
  categoryLegendLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  categoryLegendName: {
    textTransform: "capitalize",
  },
  categoryLegendValue: {
    color: "#e8eef9",
  },
  donutWrap: {
    position: "relative",
    width: "100%",
    maxWidth: 320,
    margin: "0 auto",
  },
  donutSvg: {
    width: "100%",
    height: "auto",
    display: "block",
  },
  donutCenter: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    pointerEvents: "none",
  },
  donutCenterLabel: {
    fontSize: 12,
    color: "#8ea5cb",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  donutCenterValue: {
    fontSize: 24,
    fontWeight: 800,
  },
  emptyBox: {
    border: "1px dashed #385173",
    borderRadius: 14,
    padding: 18,
    color: "#97aacc",
  },
  quickEntryBox: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 2fr) minmax(140px, 1fr) 110px minmax(180px, 1.2fr)",
    gap: 10,
    marginBottom: 10,
  },
  quickInputText: {
    minWidth: 0,
  },
  quickInputAmount: {
    minWidth: 0,
  },
  quickInputCurrency: {
    minWidth: 0,
  },
  quickInputCategory: {
    minWidth: 0,
  },
  enterHint: {
    color: "#8ea5cb",
    fontSize: 13,
    marginTop: 0,
    marginBottom: 14,
  },
  simpleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 16,
    border: "1px solid rgba(52, 77, 112, 0.78)",
    background: "rgba(10, 18, 31, 0.72)",
    marginBottom: 10,
  },
  simpleRowLeft: {
    minWidth: 0,
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  simpleRowRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  simpleRowLabel: {
    color: "#ecf2ff",
    fontSize: 15,
    wordBreak: "break-word",
  },
  categoryBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 10px",
    borderRadius: 999,
    background: "rgba(112, 195, 255, 0.10)",
    border: "1px solid rgba(112, 195, 255, 0.22)",
    color: "#9bd7ff",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "capitalize",
  },
  simpleRowAmount: {
    color: "#d9e8ff",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  deleteSquareButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    border: "none",
    background: "#c93d57",
    color: "white",
    cursor: "pointer",
    fontSize: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  label: {
    display: "block",
    fontSize: 13,
    marginBottom: 6,
    color: "#9db0d0",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    borderRadius: 12,
    border: "1px solid rgba(58, 80, 112, 0.92)",
    background: "rgba(8, 15, 27, 0.85)",
    color: "#ecf2ff",
    outline: "none",
  },
  statCard: {
    position: "relative",
    overflow: "hidden",
  },
  statAccent: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: "50%",
    top: -18,
    right: -18,
    opacity: 0.25,
    filter: "blur(2px)",
  },
  statTitle: {
    color: "#99add1",
    fontSize: 14,
    marginBottom: 8,
    position: "relative",
    zIndex: 1,
  },
  statValue: {
    fontSize: 30,
    fontWeight: 700,
    position: "relative",
    zIndex: 1,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    padding: "10px 0",
    borderBottom: "1px solid rgba(61, 89, 130, 0.34)",
  },
  divider: {
    height: 1,
    background: "rgba(72, 99, 140, 0.5)",
    margin: "12px 0",
  },
  note: {
    color: "#9db0d0",
    marginTop: 0,
    marginBottom: 16,
    lineHeight: 1.5,
  },
  chartWrap: {
    width: "100%",
  },
  chartSvg: {
    width: "100%",
    height: 260,
    display: "block",
  },
  chartFooterValue: {
    marginTop: 10,
    color: "#9bd7ff",
    fontWeight: 700,
  },
  chartFooterRow: {
    display: "flex",
    gap: 14,
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 12,
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "#96abcf",
    fontSize: 13,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    display: "inline-block",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    minWidth: 980,
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: 12,
    borderBottom: "1px solid rgba(72, 99, 140, 0.55)",
    color: "#9db0d0",
    fontSize: 14,
  },
  td: {
    padding: 12,
    borderBottom: "1px solid rgba(30, 44, 69, 0.95)",
    fontSize: 14,
  },
};
