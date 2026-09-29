/* ============================================================================
   CALENDAR MODULE  (calendar.js)
   Beyene-Kudlek JDN based Ethiopian <-> Gregorian conversion.
   ============================================================================ */
const Calendar = (function(){
  const JD_EPOCH_OFFSET_AMETE_ALEM = -285019;
  const JD_EPOCH_OFFSET_AMETE_MIHRET = 1723856;
  const JD_EPOCH_OFFSET_GREGORIAN = 1721426;

  const ET_MONTHS = ["Meskerem","Tikimt","Hidar","Tahsas","Tir","Yekatit","Megabit","Miazia","Ginbot","Sene","Hamle","Nehase","Pagume"];

  function mod(i,j){ return i - (j*Math.floor(i/j)); }

  function isGregorianLeap(year){
    return (year % 4 === 0) && ((year % 100 !== 0) || (year % 400 === 0));
  }
  function isEthiopianLeap(year){
    return mod(year,4) === 3;
  }

  function ethiopicToJDN(year, month, day, era){
    era = era === undefined ? JD_EPOCH_OFFSET_AMETE_MIHRET : era;
    return (era + 365) + 365*(year-1) + Math.floor(year/4) + 30*month + day - 31;
  }

  function jdnToGregorian(jdn){
    const JD_OFFSET = JD_EPOCH_OFFSET_GREGORIAN;
    const nMonths = 12;
    const monthDays = [0,31,28,31,30,31,30,31,31,30,31,30,31];
    const r2000 = mod(jdn - JD_OFFSET, 730485);
    const r400 = mod(jdn - JD_OFFSET, 146097);
    const r100 = mod(r400, 36524);
    const r4 = mod(r100, 1461);
    let n = mod(r4,365) + 365*Math.floor(r4/1460);
    const s = Math.floor(r4/1095);
    const aprime = 400*Math.floor((jdn-JD_OFFSET)/146097) + 100*Math.floor(r400/36524) + 4*Math.floor(r100/1461) + Math.floor(r4/365) - Math.floor(r4/1460) - Math.floor(r2000/730484);
    const year = aprime + 1;
    const t = Math.floor((364 + s - n)/306);
    let month = t*(Math.floor(n/31)+1) + (1-t)*(Math.floor((5*(n-s)+13)/153)+1);
    n += 1 - Math.floor(r2000/730484);
    let day = n;
    if(r100===0 && n===0 && r400!==0){
      month = 12; day = 31;
    } else {
      monthDays[2] = isGregorianLeap(year) ? 29 : 28;
      for(let i=1;i<=nMonths;i++){
        if(n<=monthDays[i]){ day=n; break; }
        n -= monthDays[i];
      }
    }
    return {year, month, day};
  }

  function gregorianToJDN(year, month, day){
    const JD_OFFSET = JD_EPOCH_OFFSET_GREGORIAN;
    const s = Math.floor(year/4) - Math.floor((year-1)/4) - Math.floor(year/100) + Math.floor((year-1)/100) + Math.floor(year/400) - Math.floor((year-1)/400);
    const t = Math.floor((14-month)/12);
    const n = 31*t*(month-1) + (1-t)*(59+s+30*(month-3)+Math.floor((3*month-7)/5)) + day - 1;
    const j = JD_OFFSET + 365*(year-1) + Math.floor((year-1)/4) - Math.floor((year-1)/100) + Math.floor((year-1)/400) + n;
    return j;
  }

  function jdnToEthiopic(jdn, era){
    era = era === undefined ? JD_EPOCH_OFFSET_AMETE_MIHRET : era;
    const r = mod(jdn-era, 1461);
    const n = mod(r,365) + 365*Math.floor(r/1460);
    const year = 4*Math.floor((jdn-era)/1461) + Math.floor(r/365) - Math.floor(r/1460);
    const month = Math.floor(n/30) + 1;
    const day = mod(n,30) + 1;
    return {year, month, day};
  }

  function guessEra(jdn){
    return jdn >= (JD_EPOCH_OFFSET_AMETE_MIHRET + 365) ? JD_EPOCH_OFFSET_AMETE_MIHRET : JD_EPOCH_OFFSET_AMETE_ALEM;
  }

  function toGregorian(y,m,d){
    return jdnToGregorian(ethiopicToJDN(y,m,d, JD_EPOCH_OFFSET_AMETE_MIHRET));
  }
  function toEthiopian(y,m,d){
    const jdn = gregorianToJDN(y,m,d);
    return jdnToEthiopic(jdn, guessEra(jdn));
  }
  function jdnOfEthiopian(y,m,d){
    return ethiopicToJDN(y,m,d, JD_EPOCH_OFFSET_AMETE_MIHRET);
  }
  function todayEthiopian(){
    const now = new Date();
    return toEthiopian(now.getFullYear(), now.getMonth()+1, now.getDate());
  }
  function monthLength(year, month){
    if(month === 13) return isEthiopianLeap(year) ? 6 : 5;
    return 30;
  }
  function monthName(m){ return ET_MONTHS[m-1]; }
  function formatEthiopian(dateObj){
    if(!dateObj) return "—";
    return monthName(dateObj.month) + " " + dateObj.day + ", " + dateObj.year;
  }

  return { ET_MONTHS, isEthiopianLeap, toGregorian, toEthiopian, jdnOfEthiopian, todayEthiopian, monthLength, monthName, formatEthiopian };
})();
