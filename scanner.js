class Scanner extends Tank {
  //программе допустимо иметь свои переменные для запоминания чего-бы то ни было
  gunDegree = 0;

  constructor() {
    this.setColor(); //hex
    this.setName("Scanner"); //Именование бота - программа приплюсовывается -<id>
    this.setTeam("teamName"); //Танк можно прикрепить к команде
  }
  main() {
    //метод итеративно вызывается в ядре (каждые 100 мс по-умолчанию)
    this.setGunDegree(this.gunDegree);
    this.gunDegree += 10;
  }

  onLaserScan(info) {
    //Метод наследуется от класса родителя Tank
    if (info.target === "tank" && info.hostile) {
      //в случае если обнаружен танк и он не в моей команде
      //если мой лазер увидел вражеский танк
      this.fire(); //немедленно стреляет ПТУРом
    }

    if (info.target === "non-tank") {
      if (info.distance < 5) this.stop(); //впереди стена - немедленно тормозим
    }
  }

  onLaserDetection(info) {
    this.fireSmoke();
    this.setGunDegree(info.degree); //угол с которого меня облучают
    this.fire(); // выстрел ПТУРом
    this.setDirection(this.getRandomDegree()); //устанавливает случайно направление движения
    //this.getRandomDegree() //метод наследуется от класса родителя и возвращает случайный угол (от 0 до 359.99)
    this.setSpeed(5); //Устанавливает максимальную скорость движения
  }

  onSound(info) {
    //если танк услышал звук
    this.setDirection(info.degree); //устанавливает курс движения в направлении звука
    this.setGunDirection(info.degree); //устанавливает пушку в направлении звука - т.к. лазер всегда светит в направлении пушки
    this.impulseScan(); //пускаем короткий сигнал лазером
    if (this.laserData().target === "tank") {
      this.fire(); //в случае, если в направлении звука есть танк - немедленно стреляем ПТУРом
    }
    this.setSpeed(1); //начинаем медленное движение в сторону звука
  }
}
