import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import robot as R, bpy

col = sys.argv[1] if len(sys.argv) > 1 else 'blue'
face = sys.argv[2] if len(sys.argv) > 2 else 'happy'
topper = sys.argv[3] if len(sys.argv) > 3 else 'antenna'
chest = sys.argv[4] if len(sys.argv) > 4 else 'planet'
tool = sys.argv[5] if len(sys.argv) > 5 else 'wrench'
back = sys.argv[6] if len(sys.argv) > 6 else 'backpack'
out = sys.argv[7] if len(sys.argv) > 7 else '/tmp/robot_test.png'
samples = int(sys.argv[8]) if len(sys.argv) > 8 else 48

t = time.time()
R.setup_scene(res=(640, 800), samples=samples); R.set_colour(col)
c = R.new_coll('base'); R.build_base(col, c)
c = R.new_coll('face'); R.build_face(face, col, c)
c = R.new_coll('topper'); R.build_topper(topper, col, c)
c = R.new_coll('chest'); R.build_chest(chest, col, c)
c = R.new_coll('tool'); R.build_tool(tool, col, c)
c = R.new_coll('back'); R.build_back(back, col, c)
R.render(out)
print('rendered', out, round(time.time()-t, 1), 's')
