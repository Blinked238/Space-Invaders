import { fromEvent, interval, merge } from 'rxjs'; 
import { map, filter, scan} from 'rxjs/operators';

// Author: Justin Yeow (27953653)
// FIT2102 S2 2021 Assignment 1
// Implementation of the classic game: Space Invaders
// Implementation was heavily inspired from Prof.Tim Dwyer's implementation of Asteroids FRP style game:
// https://tgdwyer.github.io/asteroids/ 



type Key = 'ArrowLeft' | 'ArrowRight'| 'Space' | 'Enter'
type Event = 'keydown' | 'keyup'

function spaceinvaders() {
  const 
    Constants = {
      CanvasSize: 800,
      BulletRadius: 5,
      BulletVelocity: 2,
      StartAlienRadius: 18,
      StartAliensCount: 9,
      StartTime: 0,
      StartShieldRadius: 10,
      StartShieldCount: 60
  } as const


  type ViewType = 'ship' | 'alien' | 'bullet' | 'enemyBullet' | 'shield' 

  class Tick { constructor(public readonly elapsed:number) {} }
  class Shoot { constructor() {} }
  class moveShip { constructor(public readonly distance:number) {} }
  class stopShip { constructor(public readonly distance:number) {} }
  class moveAlien { constructor(){}}
  class restartGame { constructor() {} }
  class shootAlien { constructor(){}}


  const 
    gameClock = interval(10)
      .pipe(map(elapsed=>new Tick(elapsed))),
        keyObservable = <T>(e:Event, k:Key, result:()=>T)=>
        fromEvent<KeyboardEvent>(document,e)
        .pipe(
          filter(({code})=>code === k),
          filter(({repeat})=>!repeat),
          map(result)),

    startLeft = keyObservable('keydown','ArrowLeft',()=>new moveShip(-5)),
    startRight = keyObservable('keydown','ArrowRight',()=>new moveShip(5)),
    stopLeft = keyObservable('keyup','ArrowLeft',()=>new stopShip(0)),
    stopRight = keyObservable('keyup','ArrowRight',()=>new stopShip(0)),
    shoot = keyObservable('keydown','Space', ()=>new Shoot()),
    moveEnemies = interval(10).pipe(map((_)=>new moveAlien())),
    restartEnter = keyObservable('keydown', 'Enter', ()=>new restartGame()),
    shootEnemy = interval(1000).pipe(map((_) =>new shootAlien()))


  type Circle = Readonly<{ pos: Vec, radius: number }>
  type ObjectId = Readonly<{ id: string, createTime: number }>
  
  interface IBody extends Circle, ObjectId {
    viewType: ViewType,
    vel: Vec,
    acc: Vec,
    angle: number,
    rotation: number,
    torque: number
  }
  // Every object that participates in physics is a Body
  type Body = Readonly<IBody>

  // Game State
  type State = Readonly<{
    time: number,
    ship: Body,
    bullets: ReadonlyArray<Body>,
    enemyBullets: ReadonlyArray<Body>,
    aliens:ReadonlyArray<Body>,
    exit: ReadonlyArray<Body>,
    objCount: number,
    gameOver:boolean,
    gameWon:boolean,
    score: number,
    stageClear: boolean,
    shields: ReadonlyArray<Body>
    level: number
  }>


  // Aliens, shields and bullets are all circles
  // adapted from Asteroids code by Tim Dwyer:
  // https://tgdwyer.github.io/asteroids/
  const 
    createCircle = (viewType: ViewType) => (oid: ObjectId) => (circ: Circle) => (vel: Vec) =>
      <Body>{
        ...oid,
        ...circ,
        vel: vel,
        acc: Vec.Zero,
        angle: 0, rotation: 0, torque: 0,
        id: viewType + oid.id,
        viewType: viewType
      },
      createAlien = createCircle('alien'),
      createBullet = createCircle('bullet'),
      createEnemyBullet = createCircle('enemyBullet'),
      createShield = createCircle('shield')


  function createShip():Body {
    return {
      id: 'ship',
      viewType: 'ship',
      pos: new Vec(380 , 425),
      vel: Vec.Zero,
      acc: Vec.Zero,
      angle:0,
      rotation:0,
      torque:0,
      radius:20,
      createTime:0
    }
  }

  // create two rows of aliens (9 in total) at top of screen
  const spawnAliens = [...Array(Constants.StartAliensCount)]
    .map((_, i) => (i >= 0 && i <= 4)     
      ? // id of created alien greater between 0 and 4 are placed on first row
        createAlien({ id: String(i), createTime: Constants.StartTime })
          ({ pos: new Vec(i * 75 + 250, 30), radius: Constants.StartAlienRadius })
          (new Vec(2, 0))                     
      : // id of created alien greater between 5 and 9 are placed on second row
        createAlien({ id: String(i), createTime: Constants.StartTime })
          ({ pos: new Vec(i * 75 - 90, 90), radius: Constants.StartAlienRadius })
          (new Vec(2, 0)) 
    )

    // create 60 circles forming 3 grouped shields, all on the same row
    const spawnShields = [...Array(Constants.StartShieldCount)]
    .map((_, i) => (i >= 0 && i <= 20) ?     // id of created shields between 0 and 20 are lumped together as leftmost shield
      createShield({ id: String(i), createTime: Constants.StartTime })
        ({ pos: new Vec(i * 5 + 80, 350), radius: Constants.StartShieldRadius })
        (new Vec(0, 0))    // velocity, movement
      : (i >= 21 && i <= 40) ?               // id of created shields between 21 and 40 are lumped toegther as middle shield
        createShield({ id: String(i), createTime: Constants.StartTime })
          ({ pos: new Vec(i*5+230, 350), radius: Constants.StartShieldRadius })
          (new Vec(0, 0))                   // id of created shields between 41 and 60 are lumped toegther as rightmost shield
      : createShield({ id: String(i), createTime: Constants.StartTime })
      ({ pos: new Vec(i*5+380, 350), radius: Constants.StartShieldRadius })
      (new Vec(0, 0)) 
    )

  // initial state of the game. Restart leads to this state
  const initialState:State = {
    time:0,
    ship: createShip(),
    bullets: [],
    enemyBullets: [],
    aliens: spawnAliens,
    exit: [],
    objCount: Constants.StartAliensCount,
    gameOver: false,
    gameWon: false,
    score: 0,
    stageClear: false,
    shields: spawnShields,
    level: 1
  }


  const torusWrap = ({x,y}:Vec) => { 
    // keeps bodies within border of canvas. canvas size = 800
    // adapted from Asteroids code by Tim Dwyer:
    // https://tgdwyer.github.io/asteroids/
    const 
      s=Constants.CanvasSize, 
      wrap = (v:number) => v < 20 ? 20 : v > s-20 ? 780 : v;
    return new Vec(wrap(x),wrap(y))
  };

 
  const moveBody = (o:Body) => <Body>{
    // adapted from Asteroids code by Tim Dwyer:
    // https://tgdwyer.github.io/asteroids/
    ...o,
    rotation: o.rotation + o.torque,
    angle:o.angle+o.rotation,
    pos:torusWrap(o.pos.sub(o.vel)),
    // vel:o.thrust?o.vel.sub(Vec.unitVecInDirection(o.angle).scale(0.05)):o.vel
    vel:o.vel.add(o.acc)
  }

  // check a State for collisions:
  const handleCollisions = (s:State) => {
    const
      cut = except((a:Body)=>(b:Body)=>a.id === b.id),
      
      bodiesCollided = ([a,b]:[Body,Body]) => a.pos.sub(b.pos).len() < a.radius + b.radius,
      
      allBodiesShieldBullet = (body1: ReadonlyArray<Body> , body2: ReadonlyArray<Body>) => 
          flatMap(body1, b1 => body2.map<[Body, Body]>(b2 => ([b1, b2]))),
      
      // Ship collide with alien body
      shipCollided = s.aliens.filter(r=>bodiesCollided([s.ship,r])).length > 0,
      allBulletsAndAliens = flatMap(s.bullets, b=> s.aliens.map<[Body,Body]>(r=>([b,r]))),

      // Ship bullets collide with alien body
      collidedBulletsAndAliens = allBulletsAndAliens.filter(bodiesCollided),
      collidedBullets = collidedBulletsAndAliens.map(([bullet,_])=>bullet),
      collidedAliens = collidedBulletsAndAliens.map(([_,alien])=>alien),

      // Alien bullets collide with ship body
      collidedEnemyBulletsAndShip = s.enemyBullets.filter(r=>bodiesCollided([s.ship,r])).length >0,

      // Alien Bullets collide with shields
      collidedShieldsAndAlienBullets = allBodiesShieldBullet(s.enemyBullets, s.shields).filter(bodiesCollided),
      collidedAlienBulletsandShield = collidedShieldsAndAlienBullets.map(([alienBullet, _]) => alienBullet),
      collidedShieldsandAlienBullet = collidedShieldsAndAlienBullets.map(([_, shield]) => shield),

      // Alien Body collide with shields
      collidedShieldsAndAlien = allBodiesShieldBullet(s.aliens, s.shields).filter(bodiesCollided),
      collidedShieldswithAlienBody =  collidedShieldsAndAlien.map(([_, shield]) => shield)

   
    return <State>{
        // Enemy bullets destroying ship signals game over
        // Alien (body) colliding with ship also signals game over
        // clearing all aliens advances level (bullet collide with alien)
        // score reaches 270 when level 3 is completed signals game won
      ...s,
      bullets: cut(s.bullets)(collidedBullets),
      aliens: cut(s.aliens)(collidedAliens),
      exit: s.exit.concat(collidedBullets,collidedAliens,collidedAlienBulletsandShield, collidedShieldsandAlienBullet, collidedShieldswithAlienBody),
      objCount: s.objCount,
      gameOver: shipCollided|| collidedEnemyBulletsAndShip,
      gameWon: s.score==270,
      score: s.score + collidedAliens.length * 10,
      stageClear: s.aliens.length <= 0,
      shields: cut(s.shields)(collidedShieldsandAlienBullet.concat(collidedShieldswithAlienBody)),
      enemyBullets: cut(s.enemyBullets)(collidedAlienBulletsandShield),
      level: s.aliens.length <= 0 ? s.level+1 : s.level
  
    }
  }

  // Function to controls the movement of aliens. 
  // When aliens touch either border:
  //    the speed of aliens increases, 
  //    moves in the opposite direction,
  //    and also moves down a row.

  const changeAlienDirection = (s:State) => {
    const aliensOutofBounds = s.aliens.filter((circ) => circ.pos.x<=20 || circ.pos.x >= Constants.CanvasSize-20 )
    return <State>{
      ...s,
      aliens: s.aliens.map((obj)=> ({
        ...obj,
          vel: (aliensOutofBounds.length > 0)  // changes alien's movement by adjusting velocity
              ? obj.vel.ortho().scale(1.09)    // increase velocity when hit border by scaling (1.09) and  
              : obj.vel,                       // ortho() to send alien in oppsite direction (horizontal)
          pos: (aliensOutofBounds.length > 0)? obj.pos.add(new Vec(0,15)): obj.pos,      // move aliens down (vertical) when hit border
      }))
     }
  }

  const makeAlienShoot = (s:State) => {
    // Function that dictates which alien shoots
    // uses the rng class which was adapted from Tim Dwyers pi approximation video regarding the use of randomness:
    // https://www.youtube.com/watch?v=RD9v9XHA4x4&ab_channel=TimDwyer


    // pure implementation of random number generator
    // produces same output each time, using seed as time
    const r1 = new RNG(s.time);                                   // helper class RNG on line 486
    const randomNum = Math.floor(r1.float()*s.aliens.length)      // range from [0, num of aliens]
    // console.log(randomNum)

    return <State>{

      ...s,
        stageClear: s.aliens.length == 0,
        enemyBullets: s.aliens.length != 0
          ?s.enemyBullets.concat(
            [((unitVec:Vec)=>
              createEnemyBullet
                ({id:String(s.objCount), createTime:s.time})
                ({radius:Constants.BulletRadius,
                  pos: s.aliens[randomNum].                             // random alien fires bullet, based on randomNum
                    pos.add(Vec.unitVecInDirection(0).scale(-20))})     // bullet is created 20px below of alien
                (new Vec(0,-5))                                         // velocity of bullet, --> created new vector because bullet's x position changes as well. ensures straight line shot by making x = 0
           )(Vec.unitVecInDirection(90))                             
          ])
          :s.enemyBullets,
        objCount: s.objCount + 1,
    
    }
  }

  const restartTheGame = (s:State) => {
    // returns initial sate of the game and 
    // handles visibility of text to display on screen based on current state of game
    document.getElementById("gameOver").style.visibility = "hidden";
    document.getElementById("ship").style.visibility = "visible";
    document.getElementById("gameWon").style.visibility = "hidden";

    return {...initialState,
      exit: s.aliens.concat(s.bullets, s.enemyBullets)
    };

  }


// interval tick: bodies move, bullets expire
const tick = (s:State,elapsed:number) => {
  const 
    expired = (b:Body)=>(elapsed - b.createTime) > 70,    
    expiredBullets:Body[] = s.bullets.filter(expired),
    expiredEnemyBullets: Body[] = s.enemyBullets.filter(expired),
    activeBullets = s.bullets.filter(not(expired)),
    activeEnemyBullets = s.enemyBullets.filter(not(expired));
  return handleCollisions({...s, 
    ship:moveBody(s.ship), 
    bullets:activeBullets.map(moveBody), 
    enemyBullets:activeEnemyBullets.map(moveBody),
    aliens: s.aliens.map(moveBody),
    exit:expiredBullets.concat(expiredEnemyBullets),
    time:elapsed
  })
}


  const reduceState = (
    s:State, e:Tick|Shoot|moveShip| stopShip| 
    moveAlien| shootAlien| restartGame)=>
  {
    if (s.gameOver){
      // Displays game over text when game is lost (ship was hit by bullet or collided with aliens)
      // automatically restarts game to initial state when game over
      document.getElementById("gameOver").style.visibility = "visible";
      return {...initialState,
        exit: s.bullets.concat(s.enemyBullets)
      }
    }
  
    if (s.gameWon){
      // Displays victory text on screen when game is won (level 3 completed with score of 270)
      // game is halted at initial state, requires Enter to restart game
      document.getElementById("gameWon").style.visibility = "visible";
      return {...initialState,
        level: s.level,
        score: s.score,
        exit: s.bullets.concat(s.enemyBullets)
      }
    }
 
    if (s.stageClear){
      // Maintains the score and level for each stage when restarting to initial state for next level
      // maintain shields as well, keep shields damaged when moving onto next level
      document.getElementById("gameOver").style.visibility = "hidden";
      return {...initialState,
        level: s.level,
        score: s.score,
        shields: s.shields,
        exit: s.enemyBullets.concat(s.aliens, s.bullets)
      }
    }

    return e instanceof moveShip ? {...s,
        ship: {...s.ship, 
          vel: s.ship.vel.sub(Vec.unitVecInDirection(90).scale(e.distance)),
          }
      }:
      e instanceof stopShip ? {...s,
        ship: {...s.ship, 
          vel: Vec.Zero}
      }:
      e instanceof Shoot ? {...s,
        bullets: s.bullets.concat(
          [((unitVec:Vec)=>
            createBullet
              ({id:String(s.objCount), createTime:s.time})
              ({radius:Constants.BulletRadius,
                pos:s.ship.pos.add(Vec.unitVecInDirection(0).scale(20)) })  // bullet is created 20px ahead of ship (pointy area of polygon)
              (new Vec(0,5))                  // velocity of bullet, --> created new vector because bullet's x position changes as well. ensures straight line shot by making x = 0
          )(Vec.unitVecInDirection(180))     // 180 to shoot upwards, change
          ]),
        objCount: s.objCount + 1
      } : 
      e instanceof moveAlien ? 
        changeAlienDirection(s)
      : 
      e instanceof restartGame ?        
        restartTheGame(s)
      :  
      e instanceof shootAlien ?
        makeAlienShoot(s)
      :  tick(s, e.elapsed) ;
  }
  

  // Main use of subscribe
  const subscription =
    merge(gameClock, startLeft, startRight, stopLeft, stopRight, 
          shoot, moveEnemies, restartEnter, shootEnemy)
      .pipe(
        scan(reduceState, initialState))
      .subscribe(updateView)

  // Update the svg scene.  
  // This is the only impure function in this program
  function updateView(s: State) {
      // adapted from Asteroids code by Tim Dwyer:
      // https://tgdwyer.github.io/asteroids/

    const
      svg = document.getElementById("svgCanvas")!,
      ship = document.getElementById("ship")!,
      score = document.getElementById("score")!,
      level = document.getElementById("level")!,

      show = (id: string, condition: boolean) => ((e: HTMLElement) =>
        condition ? e.classList.remove('hidden')
          : e.classList.add('hidden'))(document.getElementById(id)!),
          
      updateBodyView = (b: Body) => {
        function createBodyView() {
          const v = document.createElementNS(svg.namespaceURI, "ellipse")!;
          attr(v, { id: b.id, rx: b.radius, ry: b.radius });
          v.classList.add(b.viewType)
          svg.appendChild(v)
          return v;
        }
        const v = document.getElementById(b.id) || createBodyView();
        attr(v, { cx: b.pos.x, cy: b.pos.y });
      };
    
    attr(ship, { transform: `translate(${s.ship.pos.x},${s.ship.pos.y}) rotate(${s.ship.angle})` });
    s.enemyBullets.forEach(updateBodyView);
    s.bullets.forEach(updateBodyView);
    s.aliens.forEach(updateBodyView);
    s.shields.forEach(updateBodyView);
    s.exit.map(o => document.getElementById(o.id))
      .filter(isNotNullOrUndefined)
      .forEach(v => {
        try {
          svg.removeChild(v)
        } catch (e) {
          // rarely it can happen that a bullet can be in exit 
          // for both expiring and colliding in the same tick,
          // which will cause this exception
          console.log("Already removed: " + v.id)
        }
      })


    score.innerHTML = `Score: ${s.score}` // update score on html beside canvas
    level.innerHTML = `Level: ${s.level}` // update levels on html beside canvas

  }


} // end 

function showKeys() {
  // highlights the key being pressed in the controls display, to the right of canvas
  // adapted from Asteroids code by Tim Dwyer:
  // https://tgdwyer.github.io/asteroids/

  function showKey(k: Key) {
    const arrowKey = document.getElementById(k)!,
      o = (e: Event) => fromEvent<KeyboardEvent>(document, e).pipe(
        filter(({ code }) => code === k))
    o('keydown').subscribe(e => arrowKey.classList.add("highlight"))
    o('keyup').subscribe(_ => arrowKey.classList.remove("highlight"))
  }
  showKey('ArrowLeft');
  showKey('ArrowRight');
  showKey('Space');
  showKey('Enter');
}


class Vec {
  // Vector class which applies standard maths to help assist in movement of bodies (ship, alien, bullets)
  // adapted from Asteroids code by Tim Dwyer:
  // https://tgdwyer.github.io/asteroids/

  constructor(public readonly x: number = 0, public readonly y: number = 0) {}
  add = (b:Vec) => new Vec(this.x + b.x, this.y + b.y)
  sub = (b:Vec) => this.add(b.scale(-1))
  len = ()=> Math.sqrt(this.x*this.x + this.y*this.y)
  scale = (s:number) => new Vec(this.x*s,this.y*s)
  ortho = ()=> new Vec(this.y,-this.x)
  rotate = (deg:number) =>
            (rad =>(
                (cos,sin,{x,y})=>new Vec(x*cos - y*sin, x*sin + y*cos)
              )(Math.cos(rad), Math.sin(rad), this)
            )(Math.PI * deg / 180)

  static unitVecInDirection = (deg: number) => new Vec(0,-1).rotate(deg)
  static Zero = new Vec();
}


class RNG {
  // Random Number Generator
  // Adapted from Prof.Tim Dwyers video: 
  // https://www.youtube.com/watch?v=RD9v9XHA4x4&ab_channel=TimDwyer

  // LCG using GCC's constants
  readonly m = 0x80000000// 2**31
  readonly a = 1103515245
  readonly c = 12345
  constructor(readonly state) {
  }
  int() {
    return (this.a * this.state + this.c) % this.m;
  }
  float() {
    // returns in range [0,1]
    return this.int() / (this.m - 1);
  }

  next(){
    return new RNG(this.int())    //doest mutate, gives back new rng
  }
}

// Below are helper functions which were adapted from Asteroids code by Tim Dwyer:
// https://tgdwyer.github.io/asteroids/

/**
 * apply f to every element of a and return the result in a flat array
 * @param a an array
 * @param f a function that produces an array
 */
 function flatMap<T,U>(
  a:ReadonlyArray<T>,
  f:(a:T)=>ReadonlyArray<U>
): ReadonlyArray<U> {
  return Array.prototype.concat(...a.map(f));
}

const 
/**
 * Composable not: invert boolean result of given function
 * @param f a function returning boolean
 * @param x the value that will be tested with f
 */
  not = <T>(f:(x:T)=>boolean)=> (x:T)=> !f(x),
/**
 * is e an element of a using the eq function to test equality?
 * @param eq equality test function for two Ts
 * @param a an array that will be searched
 * @param e an element to search a for
 */
  elem = 
    <T>(eq: (_:T)=>(_:T)=>boolean)=> 
      (a:ReadonlyArray<T>)=> 
        (e:T)=> a.findIndex(eq(e)) >= 0,
/**
 * array a except anything in b
 * @param eq equality test function for two Ts
 * @param a array to be filtered
 * @param b array of elements to be filtered out of a
 */ 
  except = 
    <T>(eq: (_:T)=>(_:T)=>boolean)=>
      (a:ReadonlyArray<T>)=> 
        (b:ReadonlyArray<T>)=> a.filter(not(elem(eq)(b))),
/**
 * set a number of attributes on an Element at once
 * @param e the Element
 * @param o a property bag
 */         
  attr = (e:Element,o:Object) =>
    { for(const k in o) e.setAttribute(k,String(o[k])) }
/**
 * Type guard for use in filters
 * @param input something that might be null or undefined
 */
function isNotNullOrUndefined<T extends Object>(input: null | undefined | T): input is T {
  return input != null;
}

setTimeout(showKeys, 0)

// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = () => {
    spaceinvaders();
  }